import {
  EquipmentPiece, Player, PlayerEquipment, PlayerSkills,
} from '@/types/Player';
import { Monster } from '@/types/Monster';
import {
  CombatStyle, EquipmentSlot, EQUIPMENT_SLOTS, ItemEvaluation, ItemPrice,
  OptimizationObjective, OptimizerConstraints, OptimizerPhase,
  OptimizerProgressCallback, OptimizerResult, SetBonusDefinition,
  SetBonusDetectionResult, SetBonusType, SkillRequirements, SlotOptimizationResult,
} from '@/types/Optimizer';
import {
  AmmoApplicability, ammoApplicability, availableEquipment, calculateEquipmentBonusesFromGear,
  equipmentAliases,
} from '@/lib/Equipment';
import { BLOWPIPE_IDS } from '@/lib/constants';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { getCombatStylesForCategory } from '@/utils';
import equipmentRequirementsData from '../../cdn/json/equipment-requirements.json';

/**
 * Reverse lookup map: variant item ID -> base item ID.
 * Built from equipmentAliases which maps base -> variants[].
 */
const variantToBaseMap: Map<number, number> = new Map();
for (const [baseIdStr, variantIds] of Object.entries(equipmentAliases)) {
  const baseId = parseInt(baseIdStr);
  for (const variantId of variantIds) {
    variantToBaseMap.set(variantId, baseId);
  }
}

/**
 * Get the base item ID for a variant, or the original ID if not a variant.
 */
function getBaseItemId(itemId: number): number {
  return variantToBaseMap.get(itemId) ?? itemId;
}

/**
 * Check if an equipment piece has any melee offensive bonuses.
 * Melee includes stab, slash, crush offensive stats and strength bonus.
 */
function hasMeleeBonuses(item: EquipmentPiece): boolean {
  const { offensive, bonuses } = item;
  return (
    offensive.stab > 0
    || offensive.slash > 0
    || offensive.crush > 0
    || bonuses.str > 0
  );
}

/**
 * Check if an equipment piece has any ranged offensive bonuses.
 * Ranged includes ranged offensive stat and ranged strength bonus.
 */
function hasRangedBonuses(item: EquipmentPiece): boolean {
  const { offensive, bonuses } = item;
  return offensive.ranged > 0 || bonuses.ranged_str > 0;
}

/**
 * Check if an equipment piece has any magic offensive bonuses.
 * Magic includes magic offensive stat and magic strength (damage) bonus.
 */
function hasMagicBonuses(item: EquipmentPiece): boolean {
  const { offensive, bonuses } = item;
  return offensive.magic > 0 || bonuses.magic_str > 0;
}

/**
 * Check if an equipment piece has any offensive bonuses for any combat style.
 * Used to identify "neutral" items that should be included for all styles.
 */
function hasAnyOffensiveBonuses(item: EquipmentPiece): boolean {
  return hasMeleeBonuses(item) || hasRangedBonuses(item) || hasMagicBonuses(item);
}

// ============================================================================
// Price Store
// ============================================================================

/**
 * In-memory store for item prices.
 * Maps item ID to ItemPrice info.
 *
 * This store can be populated by:
 * - data-001: Price data from GE API
 * - Manual price entries
 * - Batch loading from a prices file
 */
const priceStore: Map<number, ItemPrice> = new Map();

/**
 * Set the price for an item.
 *
 * @param itemId - The item's ID
 * @param price - The price in GP (or null if unknown)
 * @param isTradeable - Whether the item is tradeable (default: true if price is set)
 */
export function setItemPrice(itemId: number, price: number | null, isTradeable: boolean = price !== null): void {
  priceStore.set(itemId, { price, isTradeable });
}

/**
 * Set prices for multiple items at once.
 *
 * @param prices - Record mapping item IDs to prices
 * @param isTradeable - Whether these items are tradeable (default: true)
 */
export function setItemPrices(prices: Record<number, number | null>, isTradeable: boolean = true): void {
  for (const [id, price] of Object.entries(prices)) {
    priceStore.set(Number(id), { price, isTradeable });
  }
}

/**
 * Mark an item as untradeable.
 * Untradeable items have no price (null) and cannot be bought on GE.
 *
 * @param itemId - The item's ID
 */
export function setItemUntradeable(itemId: number): void {
  priceStore.set(itemId, { price: null, isTradeable: false });
}

/**
 * Clear all stored prices.
 * Useful for refreshing price data or testing.
 */
export function clearPriceStore(): void {
  priceStore.clear();
}

/**
 * Get the number of items with prices stored.
 */
export function getPriceStoreSize(): number {
  return priceStore.size;
}

// ============================================================================
// Price Fetching (data-001)
// ============================================================================

/**
 * OSRS Wiki Prices API endpoint.
 * Returns latest price data for all tradeable items.
 * @see https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
 */
const PRICES_API_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';

/**
 * User agent for API requests (required by OSRS Wiki API).
 */
const USER_AGENT = 'osrs-dps-calc - gear optimizer';

/**
 * Response structure from the OSRS Wiki Prices API.
 */
interface PricesApiResponse {
  data: {
    [itemId: string]: {
      high: number | null;
      highTime: number | null;
      low: number | null;
      lowTime: number | null;
    };
  };
}

/**
 * Result of a price fetch operation.
 */
export interface PriceFetchResult {
  success: boolean;
  itemCount: number;
  error?: string;
  timestamp: number;
}

/** Timestamp of last successful price fetch */
let lastPriceFetchTime: number | null = null;

/**
 * Get the timestamp of the last successful price fetch.
 * Returns null if prices have never been fetched.
 */
export function getLastPriceFetchTime(): number | null {
  return lastPriceFetchTime;
}

/**
 * Check if prices have been loaded.
 */
export function arePricesLoaded(): boolean {
  return priceStore.size > 0;
}

/**
 * Fetch prices from the OSRS Wiki Prices API and load them into the price store.
 *
 * This function:
 * 1. Fetches the latest price data from the OSRS Wiki API
 * 2. Clears the existing price store
 * 3. Loads all prices into the store
 * 4. Marks items with no price data as having unknown prices
 *
 * @param useMidPrice - If true, uses the average of high/low prices. If false, uses high price. Default: true.
 * @returns Result indicating success/failure and number of items loaded
 *
 * @example
 * ```typescript
 * const result = await fetchAndLoadPrices();
 * if (result.success) {
 *   console.log(`Loaded ${result.itemCount} item prices`);
 * } else {
 *   console.error(`Failed to load prices: ${result.error}`);
 * }
 * ```
 */
export async function fetchAndLoadPrices(useMidPrice: boolean = true): Promise<PriceFetchResult> {
  try {
    const response = await fetch(PRICES_API_URL, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        itemCount: 0,
        error: `API returned status ${response.status}: ${response.statusText}`,
        timestamp: Date.now(),
      };
    }

    const data: PricesApiResponse = await response.json();

    // Clear existing prices before loading new ones
    clearPriceStore();

    let loadedCount = 0;

    // Load all prices from the API response
    for (const [itemIdStr, priceData] of Object.entries(data.data)) {
      const itemId = parseInt(itemIdStr);

      // Calculate the price to use
      let price: number | null = null;
      if (priceData.high !== null && priceData.low !== null) {
        if (useMidPrice) {
          price = Math.round((priceData.high + priceData.low) / 2);
        } else {
          price = priceData.high;
        }
      } else if (priceData.high !== null) {
        price = priceData.high;
      } else if (priceData.low !== null) {
        price = priceData.low;
      }

      // Store the price (null prices are handled by the store)
      setItemPrice(itemId, price, true);
      loadedCount += 1;
    }

    lastPriceFetchTime = Date.now();

    return {
      success: true,
      itemCount: loadedCount,
      timestamp: lastPriceFetchTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      itemCount: 0,
      error: errorMessage,
      timestamp: Date.now(),
    };
  }
}

/**
 * Refresh prices by fetching the latest data from the API.
 * Alias for fetchAndLoadPrices for convenience.
 *
 * @param useMidPrice - If true, uses the average of high/low prices. If false, uses high price. Default: true.
 * @returns Result indicating success/failure and number of items loaded
 */
export async function refreshPrices(useMidPrice: boolean = true): Promise<PriceFetchResult> {
  return fetchAndLoadPrices(useMidPrice);
}

/**
 * Get the price info for an item.
 *
 * @param itemId - The item's ID
 * @returns ItemPrice info, or undefined if no price data exists
 */
export function getItemPriceInfo(itemId: number): ItemPrice | undefined {
  return priceStore.get(itemId);
}

/**
 * Get the price of an item.
 *
 * Returns:
 * - The stored price if available
 * - 0 if item is untradeable
 * - null if price is unknown
 *
 * @param itemId - The item's ID
 * @returns Price in GP, 0 for untradeable items, or null if unknown
 */
export function getItemPrice(itemId: number): number | null {
  const info = priceStore.get(itemId);
  if (!info) {
    return null; // No price data available
  }
  if (!info.isTradeable) {
    return 0; // Untradeable items are effectively free
  }
  return info.price;
}

/**
 * Get the effective price of an item considering ownership.
 *
 * If the item is owned, the effective price is 0 (already have it).
 * Otherwise, returns the item's price from the price store.
 *
 * @param itemId - The item's ID
 * @param ownedItems - Optional set of owned item IDs
 * @returns Effective price in GP, 0 for owned/untradeable, or null if unknown
 */
export function getEffectivePrice(itemId: number, ownedItems?: Set<number>): number | null {
  // Owned items are free
  if (ownedItems?.has(itemId)) {
    return 0;
  }
  return getItemPrice(itemId);
}

/**
 * Check if an item is within budget.
 *
 * An item is within budget if:
 * - It's owned (effective price = 0)
 * - It's untradeable (effective price = 0)
 * - Its price is <= maxBudget
 * - Its price is unknown (we include unknown prices by default to avoid
 *   excluding items before price data is loaded)
 *
 * @param itemId - The item's ID
 * @param maxBudget - Maximum budget in GP
 * @param ownedItems - Optional set of owned item IDs
 * @param excludeUnknownPrices - If true, exclude items with unknown prices (default: false)
 * @returns True if the item is within budget
 */
export function isItemWithinBudget(
  itemId: number,
  maxBudget: number,
  ownedItems?: Set<number>,
  excludeUnknownPrices: boolean = false,
): boolean {
  const effectivePrice = getEffectivePrice(itemId, ownedItems);

  // If price is unknown
  if (effectivePrice === null) {
    // Include by default unless explicitly excluding unknown prices
    return !excludeUnknownPrices;
  }

  // Check if within budget
  return effectivePrice <= maxBudget;
}

// ============================================================================
// Equipment Requirements Store (data-004)
// ============================================================================

/**
 * Type for the requirements JSON data structure.
 */
type RequirementsData = Record<string, SkillRequirements>;

/**
 * In-memory store for equipment skill requirements.
 * Loaded from cdn/json/equipment-requirements.json on import.
 */
const requirementsStore: Map<number, SkillRequirements> = new Map();

/**
 * Load requirements from the imported JSON data.
 * Called automatically on module load.
 */
function initializeRequirementsStore(): void {
  const data = equipmentRequirementsData as RequirementsData;
  for (const [itemIdStr, requirements] of Object.entries(data)) {
    const itemId = parseInt(itemIdStr);
    if (!Number.isNaN(itemId) && requirements && Object.keys(requirements).length > 0) {
      requirementsStore.set(itemId, requirements);
    }
  }
}

// Initialize requirements store on module load
initializeRequirementsStore();

/**
 * Get the number of items with requirements stored.
 */
export function getRequirementsStoreSize(): number {
  return requirementsStore.size;
}

/**
 * Check if requirements data is loaded.
 */
export function areRequirementsLoaded(): boolean {
  return requirementsStore.size > 0;
}

/**
 * Check if an item has known requirements in the requirements store.
 * Returns true if the item (or its base item via alias) is in the requirements store.
 *
 * @param itemId - The item's ID
 * @returns True if requirements are known for this item
 */
export function hasKnownRequirements(itemId: number): boolean {
  // Check direct requirements
  if (requirementsStore.has(itemId)) {
    return true;
  }

  // Check if it's a variant with a base item that has requirements
  const baseId = getBaseItemId(itemId);
  if (baseId !== itemId) {
    return requirementsStore.has(baseId);
  }

  return false;
}

// Set to track items we've already warned about (to avoid spam)
const warnedMissingRequirements: Set<number> = new Set();

/**
 * Get the skill requirements for an item.
 * If the item is a variant (ornament kit, locked version, etc.), looks up the base item's requirements.
 *
 * @param itemId - The item's ID
 * @returns SkillRequirements object, or undefined if no requirements exist (item has no skill requirements)
 */
export function getItemRequirements(itemId: number): SkillRequirements | undefined {
  // First check if this item has requirements directly
  const directReqs = requirementsStore.get(itemId);
  if (directReqs) {
    return directReqs;
  }

  // If not, check if it's a variant and look up the base item's requirements
  const baseId = getBaseItemId(itemId);
  if (baseId !== itemId) {
    return requirementsStore.get(baseId);
  }

  return undefined;
}

/**
 * Map of skill names in requirements data to PlayerSkills property names.
 * The requirements data uses lowercase skill names, PlayerSkills uses abbreviated names.
 */
const SKILL_NAME_MAP: Record<string, keyof PlayerSkills> = {
  attack: 'atk',
  strength: 'str',
  defence: 'def',
  ranged: 'ranged',
  magic: 'magic',
  prayer: 'prayer',
  hitpoints: 'hp',
  mining: 'mining',
  herblore: 'herblore',
  // Skills not in PlayerSkills are not checked (slayer, agility, etc.)
};

/**
 * Check if a player meets the skill requirements for an item.
 *
 * @param playerSkills - The player's skill levels
 * @param itemId - The item's ID
 * @returns True if the player meets all requirements, or if the item has no requirements
 */
export function playerMeetsRequirements(playerSkills: PlayerSkills, itemId: number): boolean {
  const requirements = getItemRequirements(itemId);

  // No requirements = player can equip
  if (!requirements) {
    return true;
  }

  // Check each requirement
  for (const [skillName, requiredLevel] of Object.entries(requirements)) {
    const playerSkillKey = SKILL_NAME_MAP[skillName];

    if (playerSkillKey) {
      const playerLevel = playerSkills[playerSkillKey];
      if (playerLevel < requiredLevel) {
        return false;
      }
    }
    // Skills not in SKILL_NAME_MAP are ignored (e.g., slayer, agility)
    // These could be added to PlayerSkills in the future if needed
  }

  return true;
}

/**
 * Check if a player meets the skill requirements for an equipment piece.
 *
 * @param playerSkills - The player's skill levels
 * @param item - The equipment piece to check
 * @returns True if the player meets all requirements
 */
export function playerMeetsItemRequirements(playerSkills: PlayerSkills, item: EquipmentPiece): boolean {
  return playerMeetsRequirements(playerSkills, item.id);
}

/**
 * Filter equipment by skill requirements.
 *
 * Returns only items that the player can equip based on their skill levels.
 * Items without known requirements in the requirements store are excluded and logged as warnings.
 *
 * @param playerSkills - The player's skill levels
 * @param equipment - Optional array of equipment to filter. Defaults to all available equipment.
 * @returns Array of equipment pieces the player can equip
 *
 * @example
 * ```typescript
 * const playerSkills = { atk: 75, str: 75, def: 75, ranged: 1, magic: 1, hp: 99, prayer: 70, mining: 1, herblore: 1 };
 * const equippable = filterBySkillRequirements(playerSkills);
 *
 * // Chain with other filters
 * const weapons = filterBySlot('weapon');
 * const equippableWeapons = filterBySkillRequirements(playerSkills, weapons);
 * ```
 */
export function filterBySkillRequirements(
  playerSkills: PlayerSkills,
  equipment: EquipmentPiece[] = availableEquipment,
): EquipmentPiece[] {
  return equipment.filter((item) => {
    // First check if we have known requirements for this item
    if (!hasKnownRequirements(item.id)) {
      // Log warning once per item
      if (!warnedMissingRequirements.has(item.id)) {
        warnedMissingRequirements.add(item.id);
        console.warn(`[OPT-WARN] Item "${item.name}" (id: ${item.id}) has no requirements entry - excluding from optimization`);
      }
      return false;
    }

    // Check if player meets the requirements
    return playerMeetsRequirements(playerSkills, item.id);
  });
}

/**
 * Get all equipment grouped by slot.
 *
 * @param equipment - Optional array of equipment to group. Defaults to all available equipment.
 * @returns A record mapping each slot to its equipment pieces
 */
export function groupBySlot(
  equipment: EquipmentPiece[] = availableEquipment,
): Record<EquipmentSlot, EquipmentPiece[]> {
  const result: Record<EquipmentSlot, EquipmentPiece[]> = {
    head: [],
    cape: [],
    neck: [],
    ammo: [],
    weapon: [],
    body: [],
    shield: [],
    legs: [],
    hands: [],
    feet: [],
    ring: [],
  };

  for (const item of equipment) {
    if (item.slot in result) {
      result[item.slot].push(item);
    }
  }

  return result;
}

// ============================================================================
// Set Bonus Definitions (opt-006)
// ============================================================================

/**
 * Item name patterns for Void Knight set pieces.
 * Includes base versions, ornament kits (or), and any recolored variants.
 */
const VOID_ROBES: string[] = ['Void knight top', 'Elite void top'];
const VOID_LEGS: string[] = ['Void knight robe', 'Elite void robe'];
const VOID_GLOVES: string[] = ['Void knight gloves'];
const VOID_MELEE_HELM: string[] = ['Void melee helm'];
const VOID_RANGER_HELM: string[] = ['Void ranger helm'];
const VOID_MAGE_HELM: string[] = ['Void mage helm'];

/**
 * Item name patterns for Elite Void set pieces (upgraded from regular).
 */
const ELITE_VOID_TOP: string[] = ['Elite void top'];
const ELITE_VOID_ROBE: string[] = ['Elite void robe'];

/**
 * Item name patterns for Inquisitor's set pieces.
 */
const INQUISITOR_HELM: string[] = ["Inquisitor's great helm"];
const INQUISITOR_BODY: string[] = ["Inquisitor's hauberk"];
const INQUISITOR_LEGS: string[] = ["Inquisitor's plateskirt"];
const INQUISITOR_MACE: string[] = ["Inquisitor's mace"];

/**
 * Item name patterns for Obsidian set pieces.
 */
const OBSIDIAN_HELM: string[] = ['Obsidian helmet'];
const OBSIDIAN_BODY: string[] = ['Obsidian platebody'];
const OBSIDIAN_LEGS: string[] = ['Obsidian platelegs'];

/**
 * Tzhaar weapons that activate Obsidian set bonus.
 */
const TZHAAR_WEAPONS: string[] = [
  'Tzhaar-ket-em',
  'Tzhaar-ket-om',
  'Tzhaar-ket-om (t)',
  'Toktz-xil-ak',
  'Toktz-xil-ek',
  'Toktz-mej-tal',
];

/**
 * All set bonus definitions.
 * Each definition includes the pieces required and the combat style it benefits.
 */
export const SET_BONUS_DEFINITIONS: SetBonusDefinition[] = [
  {
    type: 'void_melee',
    name: 'Void Knight (Melee)',
    combatStyle: 'melee',
    pieces: {
      head: VOID_MELEE_HELM,
      body: VOID_ROBES,
      legs: VOID_LEGS,
      hands: VOID_GLOVES,
    },
    bonus: '+10% accuracy and damage',
  },
  {
    type: 'void_ranged',
    name: 'Void Knight (Ranged)',
    combatStyle: 'ranged',
    pieces: {
      head: VOID_RANGER_HELM,
      body: VOID_ROBES,
      legs: VOID_LEGS,
      hands: VOID_GLOVES,
    },
    bonus: '+10% accuracy and damage',
  },
  {
    type: 'void_magic',
    name: 'Void Knight (Magic)',
    combatStyle: 'magic',
    pieces: {
      head: VOID_MAGE_HELM,
      body: VOID_ROBES,
      legs: VOID_LEGS,
      hands: VOID_GLOVES,
    },
    bonus: '+45% accuracy',
  },
  {
    type: 'elite_void_ranged',
    name: 'Elite Void (Ranged)',
    combatStyle: 'ranged',
    pieces: {
      head: VOID_RANGER_HELM,
      body: ELITE_VOID_TOP,
      legs: ELITE_VOID_ROBE,
      hands: VOID_GLOVES,
    },
    bonus: '+10% accuracy, +12.5% damage',
  },
  {
    type: 'elite_void_magic',
    name: 'Elite Void (Magic)',
    combatStyle: 'magic',
    pieces: {
      head: VOID_MAGE_HELM,
      body: ELITE_VOID_TOP,
      legs: ELITE_VOID_ROBE,
      hands: VOID_GLOVES,
    },
    bonus: '+45% accuracy, +2.5% damage',
  },
  {
    type: 'inquisitor',
    name: "Inquisitor's",
    combatStyle: 'melee',
    pieces: {
      head: INQUISITOR_HELM,
      body: INQUISITOR_BODY,
      legs: INQUISITOR_LEGS,
    },
    bonus: '+2.5% crush accuracy and damage per piece (with mace)',
  },
  {
    type: 'obsidian',
    name: 'Obsidian',
    combatStyle: 'melee',
    pieces: {
      head: OBSIDIAN_HELM,
      body: OBSIDIAN_BODY,
      legs: OBSIDIAN_LEGS,
    },
    bonus: '+10% accuracy and damage with Tzhaar weapons',
  },
];

/**
 * Check if an equipment piece name matches any of the given patterns.
 * Uses case-insensitive partial matching to handle variants (ornament kits, recolors).
 *
 * @param itemName - The item name to check
 * @param patterns - Array of patterns to match against
 * @returns True if the item matches any pattern
 */
function matchesItemPattern(itemName: string, patterns: string[]): boolean {
  const normalizedName = itemName.toLowerCase();
  return patterns.some((pattern) => normalizedName.includes(pattern.toLowerCase()));
}

/**
 * Find an equipment piece that matches any of the given name patterns.
 *
 * @param patterns - Array of item name patterns to match
 * @param candidates - Equipment pieces to search through
 * @returns The first matching equipment piece, or null if none found
 */
export function findMatchingPiece(
  patterns: string[],
  candidates: EquipmentPiece[],
): EquipmentPiece | null {
  return candidates.find((item) => matchesItemPattern(item.name, patterns)) ?? null;
}

/**
 * Find all equipment pieces that match any of the given name patterns.
 *
 * @param patterns - Array of item name patterns to match
 * @param candidates - Equipment pieces to search through
 * @returns Array of matching equipment pieces
 */
export function findAllMatchingPieces(
  patterns: string[],
  candidates: EquipmentPiece[],
): EquipmentPiece[] {
  return candidates.filter((item) => matchesItemPattern(item.name, patterns));
}

/**
 * Get the set bonus definition for a given set type.
 *
 * @param type - The set bonus type
 * @returns The set bonus definition, or undefined if not found
 */
export function getSetBonusDefinition(type: SetBonusType): SetBonusDefinition | undefined {
  return SET_BONUS_DEFINITIONS.find((def) => def.type === type);
}

/**
 * Get all set bonus definitions that apply to a given combat style.
 *
 * @param style - The combat style
 * @returns Array of set bonus definitions for that style
 */
export function getSetBonusesForStyle(style: CombatStyle): SetBonusDefinition[] {
  return SET_BONUS_DEFINITIONS.filter(
    (def) => def.combatStyle === style || def.combatStyle === null,
  );
}

/**
 * Check if a set is complete in the given equipment.
 *
 * @param setType - The set bonus type to check
 * @param equipment - The equipment to check
 * @returns True if all pieces of the set are equipped
 */
export function isSetComplete(setType: SetBonusType, equipment: PlayerEquipment): boolean {
  const definition = getSetBonusDefinition(setType);
  if (!definition) return false;

  for (const [slot, patterns] of Object.entries(definition.pieces) as [EquipmentSlot, string[]][]) {
    const equippedItem = equipment[slot];
    if (!equippedItem || !matchesItemPattern(equippedItem.name, patterns)) {
      return false;
    }
  }

  return true;
}

/**
 * Detect if a set bonus is available from the given candidate equipment.
 *
 * This function checks:
 * 1. Whether all required pieces exist in the candidates
 * 2. Whether the pieces can be equipped (pass constraints if provided)
 *
 * @param setType - The set bonus type to detect
 * @param candidates - Equipment pieces to search for set pieces
 * @param constraints - Optional constraints to check against
 * @returns Detection result with availability, pieces found, and missing slots
 */
export function detectSetBonus(
  setType: SetBonusType,
  candidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
): SetBonusDetectionResult {
  const definition = getSetBonusDefinition(setType);
  if (!definition) {
    return {
      type: setType,
      available: false,
      canEquip: false,
      pieces: {},
      missingPieces: [],
    };
  }

  const foundPieces: Partial<PlayerEquipment> = {};
  const missingPieces: EquipmentSlot[] = [];
  let canEquip = true;

  // Group candidates by slot for faster lookup
  const candidatesBySlot = groupBySlot(candidates);

  for (const [slot, patterns] of Object.entries(definition.pieces) as [EquipmentSlot, string[]][]) {
    const slotCandidates = candidatesBySlot[slot];

    // Filter by constraints if provided
    let filteredCandidates = slotCandidates;
    if (constraints?.blacklistedItems) {
      filteredCandidates = filteredCandidates.filter(
        (item) => !constraints.blacklistedItems!.has(item.id),
      );
    }

    // Find a matching piece
    const matchingPiece = findMatchingPiece(patterns, filteredCandidates);

    if (matchingPiece) {
      foundPieces[slot] = matchingPiece;

      // Check if player meets requirements
      if (constraints?.enforceSkillReqs && constraints.playerSkills) {
        if (!playerMeetsRequirements(constraints.playerSkills, matchingPiece.id)) {
          canEquip = false;
        }
      }
    } else {
      missingPieces.push(slot);
    }
  }

  return {
    type: setType,
    available: missingPieces.length === 0,
    canEquip: missingPieces.length === 0 && canEquip,
    pieces: foundPieces,
    missingPieces,
  };
}

/**
 * Detect all available set bonuses from the given candidate equipment.
 *
 * @param candidates - Equipment pieces to search for set pieces
 * @param combatStyle - Optional combat style to filter sets
 * @param constraints - Optional constraints to check against
 * @returns Array of detection results for all sets (or style-specific sets)
 */
export function detectAllSetBonuses(
  candidates: EquipmentPiece[],
  combatStyle?: CombatStyle,
  constraints?: OptimizerConstraints,
): SetBonusDetectionResult[] {
  const definitions = combatStyle
    ? getSetBonusesForStyle(combatStyle)
    : SET_BONUS_DEFINITIONS;

  return definitions.map((def) => detectSetBonus(def.type, candidates, constraints));
}

/**
 * Get the set types that are available (all pieces found) from candidates.
 *
 * @param candidates - Equipment pieces to search for set pieces
 * @param combatStyle - Optional combat style to filter sets
 * @param constraints - Optional constraints to check against
 * @returns Array of set types that are fully available
 */
export function getAvailableSetBonuses(
  candidates: EquipmentPiece[],
  combatStyle?: CombatStyle,
  constraints?: OptimizerConstraints,
): SetBonusType[] {
  const results = detectAllSetBonuses(candidates, combatStyle, constraints);
  return results
    .filter((result) => result.available && result.canEquip)
    .map((result) => result.type);
}

/**
 * Build a complete loadout using a specific set bonus.
 *
 * This function:
 * 1. Finds the set pieces from candidates
 * 2. Returns a partial equipment object with the set pieces
 *
 * @param setType - The set bonus type to build
 * @param candidates - Equipment pieces to search for set pieces
 * @param constraints - Optional constraints to check against
 * @returns Partial equipment object with set pieces, or null if set unavailable
 */
export function buildSetLoadout(
  setType: SetBonusType,
  candidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
): Partial<PlayerEquipment> | null {
  const detection = detectSetBonus(setType, candidates, constraints);

  if (!detection.available || !detection.canEquip) {
    return null;
  }

  return detection.pieces;
}

/**
 * Check if Obsidian set would be effective with the given weapon.
 * Obsidian set only provides bonuses when using Tzhaar weapons.
 *
 * @param weapon - The weapon to check
 * @returns True if the weapon is a Tzhaar weapon that benefits from Obsidian set
 */
export function isObsidianEffectiveWithWeapon(weapon: EquipmentPiece | null | undefined): boolean {
  if (!weapon) return false;
  return matchesItemPattern(weapon.name, TZHAAR_WEAPONS);
}

/**
 * Find the best Tzhaar weapon from candidates for use with Obsidian set.
 *
 * @param candidates - Weapon candidates to search
 * @returns The best Tzhaar weapon, or null if none found
 */
export function findTzhaarWeapon(candidates: EquipmentPiece[]): EquipmentPiece | null {
  return findMatchingPiece(TZHAAR_WEAPONS, candidates.filter((c) => c.slot === 'weapon'));
}

/**
 * Check if Inquisitor's set would be effective with the player's current attack style.
 * Inquisitor's only provides bonuses when using crush attack style.
 *
 * @param player - The player to check
 * @returns True if the player is using crush attack style
 */
export function isInquisitorEffectiveForPlayer(player: Player): boolean {
  return player.style?.type === 'crush';
}

/**
 * Get the Inquisitor's mace if available, for enhanced set bonus.
 *
 * @param candidates - Equipment candidates to search
 * @returns The Inquisitor's mace, or null if not found
 */
export function findInquisitorMace(candidates: EquipmentPiece[]): EquipmentPiece | null {
  return findMatchingPiece(INQUISITOR_MACE, candidates.filter((c) => c.slot === 'weapon'));
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Cost breakdown returned by calculateLoadoutCost
 */
export interface LoadoutCostBreakdown {
  /** Net cost after deducting owned items (what you need to spend) */
  total: number;
  /** Full cost before owned items deduction (total market value) */
  fullTotal: number;
  /** Amount saved from owned items */
  ownedSavings: number;
  /** Per-slot cost (net cost, 0 for owned items) */
  perSlot: Partial<Record<EquipmentSlot, number>>;
  /** Per-slot full price (market value, even for owned items) */
  perSlotFull: Partial<Record<EquipmentSlot, number>>;
}

/**
 * Calculate the total cost of a loadout.
 *
 * Sums up the effective price of all equipped items. Owned items contribute 0 to net cost
 * but are still tracked in fullTotal for the cost breakdown display.
 * Items with unknown prices are treated as 0 cost (to avoid blocking optimization).
 *
 * @param equipment - The equipment loadout to calculate cost for
 * @param ownedItems - Optional set of owned item IDs (owned items are free)
 * @returns Object with total cost, full total, owned savings, and per-slot breakdowns
 */
export function calculateLoadoutCost(
  equipment: PlayerEquipment,
  ownedItems?: Set<number>,
): LoadoutCostBreakdown {
  let total = 0;
  let fullTotal = 0;
  let ownedSavings = 0;
  const perSlot: Partial<Record<EquipmentSlot, number>> = {};
  const perSlotFull: Partial<Record<EquipmentSlot, number>> = {};

  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment[slot];
    if (item) {
      // Get the market price (ignoring ownership)
      const marketPrice = getItemPrice(item.id) ?? 0;
      // Get the effective price (0 if owned)
      const effectivePrice = getEffectivePrice(item.id, ownedItems) ?? 0;

      perSlotFull[slot] = marketPrice;
      perSlot[slot] = effectivePrice;
      fullTotal += marketPrice;
      total += effectivePrice;

      // Track savings from owned items
      if (ownedItems?.has(item.id) && marketPrice > 0) {
        ownedSavings += marketPrice;
      }
    }
  }

  return {
    total, fullTotal, ownedSavings, perSlot, perSlotFull,
  };
}

// ============================================================================
// Blacklist Filtering
// ============================================================================

/**
 * Filter equipment by blacklist.
 *
 * Returns only items that are NOT in the blacklist.
 *
 * This function can be chained with other filters:
 * - filterByBlacklist(blacklist, filterBySlot('weapon'))
 * - filterByBudget(1000000, filterByBlacklist(blacklist, filterBySlot('weapon')))
 *
 * @param blacklist - Set of item IDs to exclude
 * @param equipment - Optional array of equipment to filter. Defaults to all available equipment.
 * @returns Array of equipment pieces not in the blacklist
 *
 * @example
 * ```typescript
 * // Exclude specific items from results
 * const blacklist = new Set([4151, 26219]); // Whip, Rapier IDs
 * const filtered = filterByBlacklist(blacklist);
 *
 * // Chain with slot filter
 * const filteredWeapons = filterByBlacklist(blacklist, filterBySlot('weapon'));
 *
 * // Chain with multiple filters
 * const weapons = filterBySlot('weapon');
 * const meleeWeapons = filterByCombatStyle('melee', weapons);
 * const allowedMeleeWeapons = filterByBlacklist(blacklist, meleeWeapons);
 * ```
 */
export function filterByBlacklist(
  blacklist: Set<number>,
  equipment: EquipmentPiece[] = availableEquipment,
): EquipmentPiece[] {
  // If blacklist is empty, return all items (optimization)
  if (blacklist.size === 0) {
    return equipment;
  }

  return equipment.filter((item) => !blacklist.has(item.id));
}

// ============================================================================
// Budget Filtering
// ============================================================================

/**
 * Filter equipment by budget.
 *
 * Returns only items that are at or below the specified max price.
 *
 * Filtering rules:
 * - Owned items are considered free (price = 0, always included if <= maxBudget)
 * - Untradeable items are considered free (price = 0, always included if <= maxBudget)
 * - Items with known prices are filtered by their price
 * - Items with unknown prices are included by default (to avoid excluding
 *   items before price data is loaded), unless excludeUnknownPrices is true
 *
 * @param maxBudget - Maximum price per item in GP
 * @param equipment - Optional array of equipment to filter. Defaults to all available equipment.
 * @param ownedItems - Optional set of owned item IDs (owned items are free)
 * @param excludeUnknownPrices - If true, exclude items with unknown prices (default: false)
 * @returns Array of equipment pieces within the budget
 *
 * @example
 * ```typescript
 * // Get all items under 1M GP
 * const affordableItems = filterByBudget(1_000_000);
 *
 * // Get items under 1M GP, but owned items are free
 * const ownedIds = new Set([4151, 12877]); // Whip, Rapier
 * const affordable = filterByBudget(1_000_000, availableEquipment, ownedIds);
 * ```
 */
export function filterByBudget(
  maxBudget: number,
  equipment: EquipmentPiece[] = availableEquipment,
  ownedItems?: Set<number>,
  excludeUnknownPrices: boolean = false,
): EquipmentPiece[] {
  return equipment.filter((item) => isItemWithinBudget(item.id, maxBudget, ownedItems, excludeUnknownPrices));
}

/**
 * Filter equipment by slot.
 *
 * Given an equipment slot, returns only items that can be equipped in that slot.
 * All 11 slots are supported: head, cape, neck, ammo, weapon, body, shield, legs, hands, feet, ring.
 *
 * @param slot - The equipment slot to filter for
 * @param equipment - Optional array of equipment to filter. Defaults to all available equipment.
 * @returns Array of equipment pieces that can be equipped in the specified slot
 */
export function filterBySlot(
  slot: EquipmentSlot,
  equipment: EquipmentPiece[] = availableEquipment,
): EquipmentPiece[] {
  if (!EQUIPMENT_SLOTS.includes(slot)) {
    throw new Error(`Invalid equipment slot: ${slot}`);
  }

  return equipment.filter((item) => item.slot === slot);
}

/**
 * Filter equipment by combat style.
 *
 * Returns items that are relevant for the specified combat style:
 * - 'melee': Items with stab/slash/crush attack or strength bonuses
 * - 'ranged': Items with ranged attack or ranged strength bonuses
 * - 'magic': Items with magic attack or magic damage bonuses
 *
 * Items with no offensive bonuses (pure defensive items) are included for all styles,
 * as they may still be useful (e.g., barrows armor for tanking).
 *
 * @param style - The combat style to filter for
 * @param equipment - Optional array of equipment to filter. Defaults to all available equipment.
 * @returns Array of equipment pieces relevant to the specified combat style
 */
export function filterByCombatStyle(
  style: CombatStyle,
  equipment: EquipmentPiece[] = availableEquipment,
): EquipmentPiece[] {
  return equipment.filter((item) => {
    // Items with no offensive bonuses are included for all styles (pure defensive gear)
    if (!hasAnyOffensiveBonuses(item)) {
      return true;
    }

    // Filter by the specific combat style
    switch (style) {
      case 'melee':
        return hasMeleeBonuses(item);
      case 'ranged':
        return hasRangedBonuses(item);
      case 'magic':
        return hasMagicBonuses(item);
      default:
        return false;
    }
  });
}

/**
 * Get a count of items per slot.
 *
 * @param equipment - Optional array of equipment to count. Defaults to all available equipment.
 * @returns A record mapping each slot to the number of items in that slot
 */
export function countBySlot(
  equipment: EquipmentPiece[] = availableEquipment,
): Record<EquipmentSlot, number> {
  const grouped = groupBySlot(equipment);
  const result: Record<EquipmentSlot, number> = {} as Record<EquipmentSlot, number>;

  for (const slot of EQUIPMENT_SLOTS) {
    result[slot] = grouped[slot].length;
  }

  return result;
}

/**
 * Filter out weapons with invalid attack speeds.
 *
 * Some weapons in the equipment database have invalid attack speeds (0 or negative),
 * typically quest items, crates, or other non-combat items. These would cause
 * incorrect DPS calculations (division by zero or negative DPS).
 *
 * Valid attack speeds are positive integers (typically 2-7 ticks).
 *
 * @param weapons - Array of weapon equipment pieces to filter
 * @returns Array of weapons with valid attack speeds (speed > 0)
 */
export function filterValidWeapons(weapons: EquipmentPiece[]): EquipmentPiece[] {
  return weapons.filter((weapon) => weapon.speed > 0);
}

/**
 * Check if an equipment piece is a powered staff or wand.
 *
 * Powered staves (trident, sanguinesti, tumeken's shadow, etc.) use built-in spells
 * and don't require separate spell selection or ammunition.
 *
 * @param item - The equipment piece to check
 * @returns True if the item is a powered staff or wand
 */
export function isPoweredStaff(item: EquipmentPiece | null | undefined): boolean {
  if (!item) return false;
  return item.category === EquipmentCategory.POWERED_STAFF
    || item.category === EquipmentCategory.POWERED_WAND;
}

/**
 * Create a copy of the player with different equipment in a specific slot.
 *
 * This creates a shallow copy of the player object with updated equipment
 * and recalculated equipment bonuses.
 *
 * @param player - The base player to copy
 * @param slot - The equipment slot to modify
 * @param item - The new equipment piece (or null to clear the slot)
 * @param monster - The monster (needed for bonus calculations like salve amulet)
 * @returns A new player object with the updated equipment and recalculated bonuses
 */
export function createPlayerWithEquipment(
  player: Player,
  slot: EquipmentSlot,
  item: EquipmentPiece | null,
  monster: Monster,
): Player {
  // Create a shallow copy of the equipment
  const newEquipment: PlayerEquipment = {
    ...player.equipment,
    [slot]: item,
  };

  // Create a new player with the updated equipment
  const newPlayer: Player = {
    ...player,
    equipment: newEquipment,
  };

  // When changing weapons, update the combat style to match the weapon's category
  // This is critical for powered staves (and other weapons) to use the correct attack style
  if (slot === 'weapon' && item) {
    const weaponCategory = item.category || EquipmentCategory.UNARMED;
    const styles = getCombatStylesForCategory(weaponCategory);
    if (styles.length > 0) {
      // Find 'Rapid' stance for ranged, or use first style as default
      const rapid = styles.find((s) => s.stance === 'Rapid');
      newPlayer.style = rapid || styles[0];
    }

    // For powered staves/wands, clear the spell as they use built-in spells
    if (weaponCategory === EquipmentCategory.POWERED_STAFF
      || weaponCategory === EquipmentCategory.POWERED_WAND) {
      newPlayer.spell = null;
    }
  }

  // Recalculate bonuses based on the new equipment
  const bonuses = calculateEquipmentBonusesFromGear(newPlayer, monster);
  newPlayer.bonuses = bonuses.bonuses;
  newPlayer.offensive = bonuses.offensive;
  newPlayer.defensive = bonuses.defensive;
  newPlayer.attackSpeed = bonuses.attackSpeed;

  return newPlayer;
}

/**
 * Calculate the DPS for a given player and monster.
 *
 * @param player - The player to calculate DPS for
 * @param monster - The monster to calculate DPS against
 * @returns The DPS value
 */
export function calculateDps(player: Player, monster: Monster): number {
  const calc = new PlayerVsNPCCalc(player, monster);
  return calc.getDps();
}

/**
 * Calculate all combat metrics for a given player and monster.
 *
 * @param player - The player to calculate metrics for
 * @param monster - The monster to calculate against
 * @returns Object containing dps, accuracy, and maxHit
 */
export function calculateMetrics(player: Player, monster: Monster): { dps: number; accuracy: number; maxHit: number } {
  const calc = new PlayerVsNPCCalc(player, monster);
  return {
    dps: calc.getDps(),
    accuracy: calc.getHitChance(),
    maxHit: calc.getMax(),
  };
}

/**
 * Get the score value for a given objective from the metrics.
 *
 * @param metrics - The calculated combat metrics
 * @param objective - The optimization objective
 * @returns The score value for the objective
 */
export function getScoreForObjective(
  metrics: { dps: number; accuracy: number; maxHit: number },
  objective: OptimizationObjective = 'dps',
): number {
  switch (objective) {
    case 'accuracy':
      return metrics.accuracy;
    case 'max_hit':
      return metrics.maxHit;
    case 'dps':
    default:
      return metrics.dps;
  }
}

/**
 * Evaluate a single equipment item's contribution to combat performance.
 *
 * Given a current loadout and a candidate item, this function calculates
 * the combat metrics with the candidate item equipped. The result includes
 * DPS value and a score based on the optimization objective.
 *
 * This function uses the existing PlayerVsNPCCalc for accurate calculations.
 *
 * @param player - The current player loadout (used as baseline)
 * @param monster - The monster to calculate against
 * @param candidateItem - The equipment item to evaluate
 * @param objective - The optimization objective (dps, accuracy, max_hit). Defaults to 'dps'.
 * @returns An ItemEvaluation containing the item, DPS, and score
 *
 * @example
 * ```typescript
 * const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });
 * const monster = getTestMonster('Abyssal demon');
 * const rapier = findEquipment('Ghrazi rapier');
 *
 * // Evaluate how rapier would perform in this loadout (optimizing for DPS)
 * const evaluation = evaluateItem(player, monster, rapier, 'dps');
 * console.log(`Rapier DPS: ${evaluation.dps}`);
 *
 * // Evaluate for max hit instead
 * const maxHitEval = evaluateItem(player, monster, rapier, 'max_hit');
 * console.log(`Rapier score (max hit): ${maxHitEval.score}`);
 * ```
 */
export function evaluateItem(
  player: Player,
  monster: Monster,
  candidateItem: EquipmentPiece,
  objective: OptimizationObjective = 'dps',
): ItemEvaluation {
  // Determine which slot the item goes in
  const slot = candidateItem.slot as EquipmentSlot;

  // Create a player with the candidate item equipped
  const playerWithItem = createPlayerWithEquipment(player, slot, candidateItem, monster);

  // Calculate all metrics with the new item
  const metrics = calculateMetrics(playerWithItem, monster);

  // Get the score based on the objective
  const score = getScoreForObjective(metrics, objective);

  return {
    item: candidateItem,
    dps: metrics.dps,
    score,
  };
}

/**
 * Calculate the DPS delta (improvement) of swapping in a candidate item.
 *
 * This is a convenience function that evaluates an item and compares it
 * to a baseline DPS value.
 *
 * @param player - The current player loadout
 * @param monster - The monster to calculate against
 * @param candidateItem - The equipment item to evaluate
 * @param baselineDps - Optional baseline DPS to compare against. If not provided,
 *                      calculates the current loadout's DPS.
 * @returns The DPS difference (positive means improvement, negative means worse)
 */
export function evaluateItemDelta(
  player: Player,
  monster: Monster,
  candidateItem: EquipmentPiece,
  baselineDps?: number,
): number {
  const baseline = baselineDps ?? calculateDps(player, monster);
  const evaluation = evaluateItem(player, monster, candidateItem);
  return evaluation.dps - baseline;
}

/**
 * Find the best item for a single equipment slot.
 *
 * Given a slot and a list of candidate items, this function evaluates each
 * candidate's contribution to the optimization objective and returns the best
 * one along with all evaluations sorted by score.
 *
 * This function respects constraints if provided:
 * - Blacklisted items are excluded from consideration
 * - Budget constraints filter out items that are too expensive (requires price data)
 * - Skill requirements filter out items the player cannot equip
 *
 * @param slot - The equipment slot to optimize
 * @param player - The current player loadout (used as context for calculation)
 * @param monster - The monster to calculate against
 * @param candidates - Optional array of candidate items. If not provided, all items
 *                     for the slot are used (filtered from available equipment).
 * @param constraints - Optional constraints to apply (blacklist, budget, etc.)
 * @param objective - The optimization objective (dps, accuracy, max_hit). Defaults to 'dps'.
 * @returns A SlotOptimizationResult containing the best item, score, and all candidates
 *
 * @example
 * ```typescript
 * const player = getTestPlayer(monster, { equipment: { weapon: whip } });
 * const monster = getTestMonster('Abyssal demon');
 *
 * // Find best weapon with no constraints (defaults to DPS)
 * const result = findBestItemForSlot('weapon', player, monster);
 * console.log(`Best weapon: ${result.bestItem?.name} with DPS: ${result.score}`);
 *
 * // Find best weapon for max hit
 * const result2 = findBestItemForSlot('weapon', player, monster, undefined, undefined, 'max_hit');
 * console.log(`Best weapon for max hit: ${result2.bestItem?.name} with score: ${result2.score}`);
 * ```
 */
export function findBestItemForSlot(
  slot: EquipmentSlot,
  player: Player,
  monster: Monster,
  candidates?: EquipmentPiece[],
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): SlotOptimizationResult {
  // Get candidates for this slot if not provided
  let items = candidates ?? filterBySlot(slot);

  // Ensure all items are for the correct slot (in case caller passed unfiltered list)
  items = items.filter((item) => item.slot === slot);

  // Apply constraints if provided
  if (constraints) {
    // Filter out blacklisted items
    if (constraints.blacklistedItems && constraints.blacklistedItems.size > 0) {
      items = items.filter((item) => !constraints.blacklistedItems!.has(item.id));
    }

    // Note: Budget filtering (filter-003) and skill requirement filtering (filter-005)
    // will be implemented in future features. For now, we just support blacklist.
  }

  // Handle case where no candidates exist
  if (items.length === 0) {
    return {
      slot,
      bestItem: null,
      score: 0,
      candidates: [],
    };
  }

  // Evaluate all candidates with the specified objective
  const evaluations: ItemEvaluation[] = items.map((item) => evaluateItem(player, monster, item, objective));

  // Sort by score descending (highest first)
  evaluations.sort((a, b) => b.score - a.score);

  // The best item is the first one after sorting
  const best = evaluations[0];

  return {
    slot,
    bestItem: best.item,
    score: best.score,
    candidates: evaluations,
  };
}

/**
 * Slot optimization order. Weapon, shield, and ammo are handled specially.
 * - Weapon + shield: handled together for 2H vs 1H+shield comparison
 * - Ammo: handled after weapon to filter valid ammo types
 * Other slots are ordered by typical impact on DPS.
 */
const SLOT_OPTIMIZATION_ORDER_NON_WEAPON: EquipmentSlot[] = [
  'head',
  'body',
  'legs',
  'hands',
  'feet',
  'cape',
  'neck',
  'ring',
  // Note: 'ammo' is intentionally excluded here - it's handled specially after weapon selection
];

/**
 * Check if an equipment piece is a two-handed weapon.
 *
 * @param item - The equipment piece to check
 * @returns True if the item is a two-handed weapon
 */
export function isTwoHandedWeapon(item: EquipmentPiece | null | undefined): boolean {
  return item?.isTwoHanded ?? false;
}

/**
 * Filter weapons to only one-handed weapons.
 *
 * @param weapons - Array of weapon equipment pieces
 * @returns Array containing only one-handed weapons
 */
export function filterOneHandedWeapons(weapons: EquipmentPiece[]): EquipmentPiece[] {
  return weapons.filter((w) => !w.isTwoHanded);
}

/**
 * Filter weapons to only two-handed weapons.
 *
 * @param weapons - Array of weapon equipment pieces
 * @returns Array containing only two-handed weapons
 */
export function filterTwoHandedWeapons(weapons: EquipmentPiece[]): EquipmentPiece[] {
  return weapons.filter((w) => w.isTwoHanded);
}

/**
 * Check if a weapon requires ammunition.
 *
 * Some ranged weapons (bows, crossbows, ballistas) require compatible ammo.
 * Others (crystal bow, blowpipe, powered staves) don't need ammo in the ammo slot.
 *
 * @param weaponId - The ID of the weapon to check
 * @returns True if the weapon requires ammunition
 */
export function weaponRequiresAmmo(weaponId: number | undefined): boolean {
  if (weaponId === undefined) {
    return false;
  }
  // If ammoApplicability returns INVALID for an arbitrary invalid ammo ID (-1),
  // it means the weapon requires specific ammo
  return ammoApplicability(weaponId, -1) === AmmoApplicability.INVALID;
}

/**
 * Check if an ammo item is valid for a given weapon.
 *
 * @param weaponId - The ID of the weapon
 * @param ammoId - The ID of the ammo to check
 * @returns True if the ammo is valid for the weapon
 */
export function isAmmoValidForWeapon(weaponId: number | undefined, ammoId: number): boolean {
  if (weaponId === undefined) {
    return false;
  }
  return ammoApplicability(weaponId, ammoId) === AmmoApplicability.INCLUDED;
}

/**
 * Filter ammo items to only those valid for a given weapon.
 *
 * @param weaponId - The ID of the weapon
 * @param ammoCandidates - Array of potential ammo items
 * @returns Array of ammo items that are valid for the weapon
 */
export function filterValidAmmoForWeapon(
  weaponId: number | undefined,
  ammoCandidates: EquipmentPiece[],
): EquipmentPiece[] {
  if (weaponId === undefined) {
    return [];
  }
  return ammoCandidates.filter(
    (ammo) => ammo.slot === 'ammo' && isAmmoValidForWeapon(weaponId, ammo.id),
  );
}

/**
 * Find the best ammo for a ranged weapon.
 *
 * Given a weapon and the current player loadout, this function finds the
 * ammunition that produces the highest score for the optimization objective.
 *
 * @param player - The base player loadout (with weapon already equipped)
 * @param monster - The monster to optimize against
 * @param ammoCandidates - Candidate ammo items (should be pre-filtered to valid ammo)
 * @param constraints - Optional constraints to apply
 * @param objective - The optimization objective (dps, accuracy, max_hit). Defaults to 'dps'.
 * @returns SlotOptimizationResult with the best ammo
 */
export function findBestAmmoForWeapon(
  player: Player,
  monster: Monster,
  ammoCandidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): SlotOptimizationResult {
  // Get the weapon ID from the player's equipment
  const weaponId = player.equipment.weapon?.id;

  if (!weaponId || !weaponRequiresAmmo(weaponId)) {
    // Weapon doesn't require ammo, return empty result
    const metrics = calculateMetrics(player, monster);
    return {
      slot: 'ammo',
      bestItem: null,
      score: getScoreForObjective(metrics, objective),
      candidates: [],
    };
  }

  // Filter to valid ammo for this weapon
  const validAmmo = filterValidAmmoForWeapon(weaponId, ammoCandidates);

  // Use findBestItemForSlot with the filtered ammo
  return findBestItemForSlot('ammo', player, monster, validAmmo, constraints, objective);
}

// =============================================================================
// BLOWPIPE DART SELECTION (weapon-001)
// =============================================================================

/**
 * Check if an equipment piece is a blowpipe weapon.
 *
 * @param item - The equipment piece to check
 * @returns True if the item is a blowpipe
 */
export function isBlowpipeWeapon(item: EquipmentPiece | null | undefined): boolean {
  if (!item) return false;
  return BLOWPIPE_IDS.includes(item.id);
}

/**
 * Check if an equipment piece is a dart that can be used with blowpipes.
 *
 * Blowpipe darts are:
 * - Equipment with slot "weapon" (darts are thrown weapons in the data)
 * - Name ends with "dart" (case-insensitive)
 * - NOT Atlatl dart (used with Eclipse atlatl, not blowpipe)
 *
 * @param item - The equipment piece to check
 * @returns True if the item is a blowpipe-compatible dart
 */
export function isBlowpipeDart(item: EquipmentPiece): boolean {
  const name = item.name.toLowerCase();
  return (
    item.slot === 'weapon'
    && name.endsWith('dart')
    && !name.includes('atlatl')
  );
}

/**
 * Get all dart items that can be used with blowpipes.
 *
 * @param equipment - Optional equipment array to filter. Defaults to availableEquipment.
 * @returns Array of dart equipment pieces sorted by ranged_str descending
 */
export function getDartItems(equipment?: EquipmentPiece[]): EquipmentPiece[] {
  const items = equipment ?? availableEquipment;
  return items
    .filter(isBlowpipeDart)
    .sort((a, b) => b.bonuses.ranged_str - a.bonuses.ranged_str);
}

/**
 * Create a blowpipe weapon with the specified dart set in itemVars.
 *
 * The returned blowpipe will have itemVars.blowpipeDartId and blowpipeDartName set.
 * This is necessary for calculateEquipmentBonusesFromGear to add the dart's ranged_str.
 *
 * @param blowpipe - The blowpipe weapon piece
 * @param dart - The dart to set in the blowpipe (or null/undefined to clear)
 * @returns A new blowpipe with the dart set in itemVars
 */
export function createBlowpipeWithDart(
  blowpipe: EquipmentPiece,
  dart: EquipmentPiece | null | undefined,
): EquipmentPiece {
  return {
    ...blowpipe,
    itemVars: dart
      ? { blowpipeDartId: dart.id, blowpipeDartName: dart.name }
      : undefined,
  };
}

/**
 * Find the best dart for a blowpipe weapon.
 *
 * Given a blowpipe and the current player loadout, this function finds the
 * dart that produces the highest score for the optimization objective.
 *
 * @param player - The base player loadout (with blowpipe already equipped)
 * @param monster - The monster to optimize against
 * @param dartCandidates - Candidate dart items (should be pre-filtered to valid darts)
 * @param constraints - Optional constraints to apply
 * @param objective - The optimization objective (dps, accuracy, max_hit). Defaults to 'dps'.
 * @returns Object containing the best dart and evaluation results
 */
export function findBestDartForBlowpipe(
  player: Player,
  monster: Monster,
  dartCandidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): {
    bestDart: EquipmentPiece | null;
    score: number;
    candidates: ItemEvaluation[];
  } {
  const weapon = player.equipment.weapon;

  if (!weapon || !isBlowpipeWeapon(weapon)) {
    // Not a blowpipe, return empty result
    const metrics = calculateMetrics(player, monster);
    return {
      bestDart: null,
      score: getScoreForObjective(metrics, objective),
      candidates: [],
    };
  }

  // Filter darts
  const validDarts = dartCandidates.filter(isBlowpipeDart);

  // Apply constraints
  const filteredDarts = constraints?.blacklistedItems
    ? validDarts.filter((d) => !constraints.blacklistedItems!.has(d.id))
    : validDarts;

  // Apply skill requirements if enabled
  const finalDarts = constraints?.enforceSkillReqs && constraints?.playerSkills
    ? filteredDarts.filter((d) => playerMeetsItemRequirements(constraints.playerSkills!, d))
    : filteredDarts;

  if (finalDarts.length === 0) {
    // No valid darts available
    const metrics = calculateMetrics(player, monster);
    return {
      bestDart: null,
      score: getScoreForObjective(metrics, objective),
      candidates: [],
    };
  }

  // Evaluate each dart by creating a blowpipe with that dart
  const evaluations: ItemEvaluation[] = [];

  for (const dart of finalDarts) {
    // Create a blowpipe with this dart
    const blowpipeWithDart = createBlowpipeWithDart(weapon, dart);

    // Create a player with this blowpipe+dart combination
    const testPlayer = createPlayerWithEquipment(player, 'weapon', blowpipeWithDart, monster);

    // Calculate metrics
    const metrics = calculateMetrics(testPlayer, monster);
    const score = getScoreForObjective(metrics, objective);

    evaluations.push({
      item: dart,
      dps: metrics.dps,
      score,
    });
  }

  // Sort by score descending
  evaluations.sort((a, b) => b.score - a.score);

  return {
    bestDart: evaluations.length > 0 ? evaluations[0].item : null,
    score: evaluations.length > 0 ? evaluations[0].score : 0,
    candidates: evaluations,
  };
}

/**
 * Find the best weapon+shield combination.
 *
 * This function handles the comparison between:
 * 1. Best two-handed weapon (no shield)
 * 2. Best one-handed weapon + best shield
 *
 * It returns the combination that produces the highest score for the objective.
 *
 * @param player - The base player loadout
 * @param monster - The monster to optimize against
 * @param weaponCandidates - Candidate weapons (filtered by style, etc.)
 * @param shieldCandidates - Candidate shields
 * @param constraints - Optional constraints to apply
 * @param objective - The optimization objective (dps, accuracy, max_hit). Defaults to 'dps'.
 * @returns Object containing the best weapon, shield (or null for 2H), score, and is2H flag
 */
export function findBestWeaponShieldCombination(
  player: Player,
  monster: Monster,
  weaponCandidates: EquipmentPiece[],
  shieldCandidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): { weapon: EquipmentPiece | null; shield: EquipmentPiece | null; score: number; is2H: boolean } {
  // Separate weapons into 1H and 2H
  const oneHandedWeapons = filterOneHandedWeapons(weaponCandidates);
  const twoHandedWeapons = filterTwoHandedWeapons(weaponCandidates);

  let best2HScore = 0;
  let best2HWeapon: EquipmentPiece | null = null;

  let best1HComboScore = 0;
  let best1HWeapon: EquipmentPiece | null = null;
  let bestShield: EquipmentPiece | null = null;

  // Evaluate best 2H weapon
  if (twoHandedWeapons.length > 0) {
    const result2H = findBestItemForSlot('weapon', player, monster, twoHandedWeapons, constraints, objective);
    if (result2H.bestItem) {
      best2HWeapon = result2H.bestItem;
      best2HScore = result2H.score;
    }
  }

  // Evaluate best 1H + shield combination
  if (oneHandedWeapons.length > 0) {
    // Find best 1H weapon first
    const result1H = findBestItemForSlot('weapon', player, monster, oneHandedWeapons, constraints, objective);
    if (result1H.bestItem) {
      best1HWeapon = result1H.bestItem;

      // Create player with best 1H weapon to evaluate shields
      const playerWith1H = createPlayerWithEquipment(player, 'weapon', best1HWeapon, monster);

      // Find best shield with the 1H weapon equipped
      if (shieldCandidates.length > 0) {
        const resultShield = findBestItemForSlot('shield', playerWith1H, monster, shieldCandidates, constraints, objective);
        if (resultShield.bestItem) {
          bestShield = resultShield.bestItem;
          // The shield result's score is with both 1H and shield equipped
          best1HComboScore = resultShield.score;
        } else {
          // No valid shield, use 1H weapon score alone
          best1HComboScore = result1H.score;
        }
      } else {
        // No shield candidates, use 1H weapon score alone
        best1HComboScore = result1H.score;
      }
    }
  }

  // Compare 2H vs 1H+shield and return the better option
  if (best2HScore >= best1HComboScore && best2HWeapon) {
    return {
      weapon: best2HWeapon,
      shield: null, // 2H weapons cannot use shield
      score: best2HScore,
      is2H: true,
    };
  }

  return {
    weapon: best1HWeapon,
    shield: bestShield,
    score: best1HComboScore,
    is2H: false,
  };
}

/**
 * Create a new player with a complete equipment set.
 *
 * This is similar to createPlayerWithEquipment but sets all slots at once.
 *
 * @param basePlayer - The base player to copy non-equipment properties from
 * @param equipment - The complete equipment set
 * @param monster - The monster (needed for bonus calculations)
 * @returns A new player with the specified equipment and recalculated bonuses
 */
function createPlayerFromEquipment(
  basePlayer: Player,
  equipment: PlayerEquipment,
  monster: Monster,
): Player {
  const newPlayer: Player = {
    ...basePlayer,
    equipment,
  };

  // Recalculate bonuses based on the new equipment
  const bonuses = calculateEquipmentBonusesFromGear(newPlayer, monster);
  newPlayer.bonuses = bonuses.bonuses;
  newPlayer.offensive = bonuses.offensive;
  newPlayer.defensive = bonuses.defensive;
  newPlayer.attackSpeed = bonuses.attackSpeed;

  return newPlayer;
}

// ============================================================================
// Set Bonus Evaluation (opt-007)
// ============================================================================

/**
 * Result of evaluating a set bonus loadout.
 */
export interface SetBonusEvaluationResult {
  /** The set type evaluated */
  setType: SetBonusType;
  /** The complete equipment loadout (set pieces + optimized remaining slots) */
  equipment: PlayerEquipment;
  /** Performance metrics for this loadout */
  metrics: {
    dps: number;
    accuracy: number;
    maxHit: number;
  };
  /** Score based on the optimization objective */
  score: number;
  /** Whether this set is valid for the current context (e.g., Obsidian needs Tzhaar weapon) */
  isValid: boolean;
  /** Reason why set may not be valid */
  invalidReason?: string;
}

/**
 * Create an empty equipment object with all slots set to null.
 */
function createEmptyEquipment(): PlayerEquipment {
  return {
    head: null,
    cape: null,
    neck: null,
    ammo: null,
    weapon: null,
    body: null,
    shield: null,
    legs: null,
    hands: null,
    feet: null,
    ring: null,
  };
}

/**
 * Create a player with partial equipment (handles null slots).
 */
function createPlayerFromEquipmentPartial(
  basePlayer: Player,
  equipment: PlayerEquipment,
  monster: Monster,
): Player {
  const newPlayer: Player = {
    ...basePlayer,
    equipment,
  };

  const bonuses = calculateEquipmentBonusesFromGear(newPlayer, monster);
  newPlayer.bonuses = bonuses.bonuses;
  newPlayer.offensive = bonuses.offensive;
  newPlayer.defensive = bonuses.defensive;
  newPlayer.attackSpeed = bonuses.attackSpeed;

  return newPlayer;
}

/**
 * Build and evaluate a complete loadout using a specific set bonus.
 *
 * This function:
 * 1. Starts with the set pieces from buildSetLoadout()
 * 2. For special sets (Obsidian, Inquisitor), handles weapon requirements
 * 3. Fills remaining slots with the best items (greedy optimization)
 * 4. Calculates DPS/metrics for the complete loadout
 *
 * @param setType - The set bonus type to evaluate
 * @param player - The base player loadout
 * @param monster - The target monster
 * @param candidatesBySlot - Pre-filtered candidates grouped by slot
 * @param constraints - Optimizer constraints
 * @param objective - Optimization objective
 * @returns SetBonusEvaluationResult with the complete loadout and metrics
 */
export function evaluateSetBonusLoadout(
  setType: SetBonusType,
  player: Player,
  monster: Monster,
  candidatesBySlot: Record<EquipmentSlot, EquipmentPiece[]>,
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): SetBonusEvaluationResult {
  const definition = getSetBonusDefinition(setType);
  if (!definition) {
    return {
      setType,
      equipment: createEmptyEquipment(),
      metrics: { dps: 0, accuracy: 0, maxHit: 0 },
      score: 0,
      isValid: false,
      invalidReason: 'Unknown set type',
    };
  }

  // Build the set pieces
  const allCandidates = Object.values(candidatesBySlot).flat();
  const setLoadout = buildSetLoadout(setType, allCandidates, constraints);

  if (!setLoadout) {
    return {
      setType,
      equipment: createEmptyEquipment(),
      metrics: { dps: 0, accuracy: 0, maxHit: 0 },
      score: 0,
      isValid: false,
      invalidReason: 'Set pieces not available',
    };
  }

  // Start with the set pieces
  const equipment: PlayerEquipment = {
    head: setLoadout.head ?? null,
    cape: null,
    neck: null,
    ammo: null,
    weapon: setLoadout.weapon ?? null,
    body: setLoadout.body ?? null,
    shield: setLoadout.shield ?? null,
    legs: setLoadout.legs ?? null,
    hands: setLoadout.hands ?? null,
    feet: null,
    ring: null,
  };

  // Track which slots are locked by the set
  const lockedSlots = new Set<EquipmentSlot>(
    Object.keys(definition.pieces) as EquipmentSlot[],
  );

  // Special handling for Obsidian set - needs Tzhaar weapon
  if (setType === 'obsidian') {
    const tzhaarWeapon = findTzhaarWeapon(candidatesBySlot.weapon);
    if (!tzhaarWeapon) {
      return {
        setType,
        equipment: createEmptyEquipment(),
        metrics: { dps: 0, accuracy: 0, maxHit: 0 },
        score: 0,
        isValid: false,
        invalidReason: 'No Tzhaar weapon available for Obsidian set',
      };
    }
    equipment.weapon = tzhaarWeapon;
    lockedSlots.add('weapon');
    // Tzhaar weapons are 1H, so we can use a shield
    // Shield will be optimized in the remaining slots step
  }

  // Special handling for Inquisitor set - can optionally use Inquisitor's mace
  if (setType === 'inquisitor') {
    // Check if player is using crush style (required for Inquisitor bonus)
    if (!isInquisitorEffectiveForPlayer(player)) {
      return {
        setType,
        equipment: createEmptyEquipment(),
        metrics: { dps: 0, accuracy: 0, maxHit: 0 },
        score: 0,
        isValid: false,
        invalidReason: 'Inquisitor set requires crush attack style',
      };
    }

    // Try to find Inquisitor's mace for enhanced bonus
    const inqMace = findInquisitorMace(candidatesBySlot.weapon);
    if (inqMace) {
      equipment.weapon = inqMace;
      lockedSlots.add('weapon');
    }
    // If no mace, weapon will be optimized in remaining slots
  }

  // Build player with current equipment for evaluation
  let currentPlayer = createPlayerFromEquipmentPartial(player, equipment, monster);

  // Optimize remaining slots (not locked by set)
  const remainingSlots: EquipmentSlot[] = [
    'weapon', 'shield', 'cape', 'neck', 'ammo', 'feet', 'ring',
  ].filter((slot) => !lockedSlots.has(slot as EquipmentSlot)) as EquipmentSlot[];

  // First handle weapon if not locked (for void sets)
  if (remainingSlots.includes('weapon')) {
    const weaponCandidates = filterValidWeapons(candidatesBySlot.weapon);
    const shieldCandidates = candidatesBySlot.shield;

    // For void sets, hands slot is locked, so shield is not available
    const effectiveShieldCandidates = lockedSlots.has('hands') ? [] : shieldCandidates;

    const weaponShieldResult = findBestWeaponShieldCombination(
      currentPlayer,
      monster,
      weaponCandidates,
      effectiveShieldCandidates,
      constraints,
      objective,
    );

    equipment.weapon = weaponShieldResult.weapon;
    if (!lockedSlots.has('shield')) {
      equipment.shield = weaponShieldResult.shield;
    }

    // Update player
    if (weaponShieldResult.weapon) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, 'weapon', weaponShieldResult.weapon, monster);
    }
    if (weaponShieldResult.shield && !lockedSlots.has('shield')) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, 'shield', weaponShieldResult.shield, monster);
    }
  }

  // Handle ammo after weapon
  if (remainingSlots.includes('ammo') || !lockedSlots.has('ammo')) {
    const weaponId = equipment.weapon?.id;
    if (weaponId && weaponRequiresAmmo(weaponId)) {
      const ammoResult = findBestAmmoForWeapon(
        currentPlayer,
        monster,
        candidatesBySlot.ammo,
        constraints,
        objective,
      );
      equipment.ammo = ammoResult.bestItem;
      if (ammoResult.bestItem) {
        currentPlayer = createPlayerWithEquipment(currentPlayer, 'ammo', ammoResult.bestItem, monster);
      }
    }
  }

  // Optimize other remaining slots
  const otherSlots: EquipmentSlot[] = ['cape', 'neck', 'feet', 'ring']
    .filter((slot) => !lockedSlots.has(slot as EquipmentSlot)) as EquipmentSlot[];

  // Also include shield if not locked and weapon is not 2H
  if (!lockedSlots.has('shield') && !isTwoHandedWeapon(equipment.weapon)) {
    if (!otherSlots.includes('shield')) {
      otherSlots.push('shield');
    }
  }

  for (const slot of otherSlots) {
    const candidates = candidatesBySlot[slot];
    const result = findBestItemForSlot(slot, currentPlayer, monster, candidates, constraints, objective);
    equipment[slot] = result.bestItem;
    if (result.bestItem) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, slot, result.bestItem, monster);
    }
  }

  // Calculate final metrics
  const finalPlayer = createPlayerFromEquipmentPartial(player, equipment, monster);
  const metrics = calculateMetrics(finalPlayer, monster);
  const score = getScoreForObjective(metrics, objective);

  return {
    setType,
    equipment,
    metrics,
    score,
    isValid: true,
  };
}

/**
 * Evaluate all available set bonuses and find the best one.
 *
 * This function:
 * 1. Detects all available sets for the combat style
 * 2. Evaluates each available set (builds complete loadout)
 * 3. Returns the best set loadout if it beats the provided greedy score
 *
 * @param player - The base player loadout
 * @param monster - The target monster
 * @param combatStyle - The combat style being optimized
 * @param candidatesBySlot - Pre-filtered candidates grouped by slot
 * @param greedyScore - The score from greedy optimization to beat
 * @param constraints - Optimizer constraints
 * @param objective - Optimization objective
 * @returns The best set evaluation result if it beats greedy, null otherwise
 */
export function findBestSetBonusLoadout(
  player: Player,
  monster: Monster,
  combatStyle: CombatStyle | undefined,
  candidatesBySlot: Record<EquipmentSlot, EquipmentPiece[]>,
  greedyScore: number,
  constraints?: OptimizerConstraints,
  objective: OptimizationObjective = 'dps',
): SetBonusEvaluationResult | null {
  // Get all candidates as flat array for set detection
  const allCandidates = Object.values(candidatesBySlot).flat();

  // Get sets relevant to the combat style
  const availableSets = getAvailableSetBonuses(allCandidates, combatStyle, constraints);

  if (availableSets.length === 0) {
    return null;
  }

  let bestResult: SetBonusEvaluationResult | null = null;
  let bestScore = greedyScore;

  for (const setType of availableSets) {
    const result = evaluateSetBonusLoadout(
      setType,
      player,
      monster,
      candidatesBySlot,
      constraints,
      objective,
    );

    if (result.isValid && result.score > bestScore) {
      bestScore = result.score;
      bestResult = result;
    }
  }

  return bestResult;
}

/**
 * Information about a potential downgrade for budget fitting.
 */
interface DowngradeOption {
  slot: EquipmentSlot;
  currentItem: EquipmentPiece;
  newItem: EquipmentPiece | null;
  costSaved: number;
  dpsLost: number;
  efficiency: number; // costSaved / dpsLost (higher = better)
}

/**
 * Find the best cheaper alternative for a slot.
 *
 * Given a slot and its current item, finds the highest-DPS item that costs
 * less than the current item.
 *
 * @param slot - The equipment slot to find alternative for
 * @param currentItem - The current item in the slot
 * @param player - The player with current equipment (excluding this slot for evaluation)
 * @param monster - The monster to optimize against
 * @param candidates - Candidate items for this slot
 * @param constraints - Optimizer constraints (including ownedItems for price calculation)
 * @returns The best cheaper alternative, or null if none exists
 */
function findCheaperAlternativeForSlot(
  slot: EquipmentSlot,
  currentItem: EquipmentPiece,
  player: Player,
  monster: Monster,
  candidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
): { item: EquipmentPiece | null; dps: number; cost: number } | null {
  const currentCost = getEffectivePrice(currentItem.id, constraints?.ownedItems) ?? 0;

  // Filter candidates to those cheaper than current item
  const cheaperCandidates = candidates.filter((item) => {
    if (item.id === currentItem.id) return false;
    const itemCost = getEffectivePrice(item.id, constraints?.ownedItems) ?? 0;
    return itemCost < currentCost;
  });

  if (cheaperCandidates.length === 0) {
    // No cheaper alternatives - only option is to empty the slot
    return { item: null, dps: 0, cost: 0 };
  }

  // Find the best among cheaper candidates
  const result = findBestItemForSlot(slot, player, monster, cheaperCandidates, constraints);

  if (!result.bestItem) {
    return { item: null, dps: 0, cost: 0 };
  }

  const newCost = getEffectivePrice(result.bestItem.id, constraints?.ownedItems) ?? 0;
  return { item: result.bestItem, dps: result.score, cost: newCost };
}

/**
 * Apply budget constraints to an optimized loadout.
 *
 * If the total cost exceeds the budget, iteratively downgrades slots with
 * the lowest DPS impact per gold saved until the loadout fits within budget.
 *
 * @param equipment - The initially optimized equipment
 * @param player - Base player for DPS calculations
 * @param monster - Target monster
 * @param budget - Maximum total budget
 * @param candidatesBySlot - Pre-filtered candidates grouped by slot
 * @param constraints - Optimizer constraints
 * @returns The budget-fitted equipment and final cost
 */
function applyBudgetConstraint(
  equipment: PlayerEquipment,
  player: Player,
  monster: Monster,
  budget: number,
  candidatesBySlot: Record<EquipmentSlot, EquipmentPiece[]>,
  constraints?: OptimizerConstraints,
): { equipment: PlayerEquipment; cost: LoadoutCostBreakdown } {
  // Create a mutable copy of the equipment
  const adjustedEquipment: PlayerEquipment = { ...equipment };

  // Calculate initial cost
  let costInfo = calculateLoadoutCost(adjustedEquipment, constraints?.ownedItems);

  // If already within budget, return as-is
  if (costInfo.total <= budget) {
    return { equipment: adjustedEquipment, cost: costInfo };
  }

  // Iteratively downgrade until within budget
  const maxIterations = 100; // Safety limit
  for (let iter = 0; iter < maxIterations && costInfo.total > budget; iter++) {
    // Find all possible downgrades and their efficiency
    const downgrades: DowngradeOption[] = [];

    for (const slot of EQUIPMENT_SLOTS) {
      const currentItem = adjustedEquipment[slot];
      if (!currentItem) continue;

      const currentCost = getEffectivePrice(currentItem.id, constraints?.ownedItems) ?? 0;
      if (currentCost === 0) continue; // Can't save money on free/owned items

      // Create player with current loadout (excluding this slot) for DPS evaluation
      const playerWithLoadout = createPlayerFromEquipment(player, adjustedEquipment, monster);
      const currentDps = calculateDps(playerWithLoadout, monster);

      // Find cheaper alternative
      const alternative = findCheaperAlternativeForSlot(
        slot,
        currentItem,
        // Remove current item from slot to evaluate alternatives fairly
        createPlayerWithEquipment(playerWithLoadout, slot, null, monster),
        monster,
        candidatesBySlot[slot],
        constraints,
      );

      if (!alternative) continue;

      const costSaved = currentCost - alternative.cost;
      if (costSaved <= 0) continue;

      // Calculate DPS with the alternative item
      const playerWithAlternative = createPlayerWithEquipment(
        playerWithLoadout,
        slot,
        alternative.item,
        monster,
      );
      const newDps = calculateDps(playerWithAlternative, monster);
      const dpsLost = currentDps - newDps;

      // Calculate efficiency (cost saved per DPS lost)
      // Higher efficiency = better downgrade (more money saved per DPS lost)
      // If dpsLost is 0 or negative (somehow got better), set efficiency to infinity
      const efficiency = dpsLost > 0 ? costSaved / dpsLost : Infinity;

      downgrades.push({
        slot,
        currentItem,
        newItem: alternative.item,
        costSaved,
        dpsLost,
        efficiency,
      });
    }

    if (downgrades.length === 0) {
      // No more possible downgrades, we've done our best
      break;
    }

    // Sort by efficiency (highest first) - prefer saving more gold per DPS lost
    downgrades.sort((a, b) => b.efficiency - a.efficiency);

    // Apply the best downgrade
    const bestDowngrade = downgrades[0];
    adjustedEquipment[bestDowngrade.slot] = bestDowngrade.newItem;

    // Recalculate cost
    costInfo = calculateLoadoutCost(adjustedEquipment, constraints?.ownedItems);
  }

  return { equipment: adjustedEquipment, cost: costInfo };
}

/**
 * Input options for the loadout optimizer.
 */
export interface OptimizeLoadoutOptions {
  /** Combat style to optimize for. If not provided, includes all styles. */
  combatStyle?: CombatStyle;
  /** Optimization objective. Defaults to 'dps'. */
  objective?: OptimizationObjective;
  /** Constraints to apply during optimization */
  constraints?: OptimizerConstraints;
  /** Callback for progress updates during optimization */
  onProgress?: OptimizerProgressCallback;
}

/**
 * Build a complete optimized loadout by optimizing all 11 equipment slots.
 *
 * This function uses a greedy per-slot algorithm:
 * 1. Pre-filters equipment by combat style (if specified)
 * 2. Optimizes weapon+shield together to handle 2H vs 1H+shield comparison
 * 3. Optimizes ammunition (if the selected weapon requires it)
 * 4. For remaining slots:
 *    - Finds the best item using `findBestItemForSlot`
 *    - Updates the player's equipment with the best item
 * 5. Applies budget constraint if specified (iteratively downgrades)
 * 6. Returns the complete optimized loadout with metrics
 *
 * Two-handed weapon handling (opt-004):
 * - Compares best 2H weapon vs best 1H weapon + best shield
 * - Chooses whichever combination produces higher DPS
 * - When 2H is selected, shield slot is set to null
 *
 * Ammunition handling (opt-005):
 * - After weapon is selected, checks if it requires ammunition
 * - For bows: selects best arrow compatible with the bow
 * - For crossbows: selects best bolt compatible with the crossbow
 * - For weapons that don't need ammo (crystal bow, blowpipe): ammo slot is left empty
 *
 * Budget constraint handling (opt-008):
 * - If maxBudget is specified in constraints, ensures total cost doesn't exceed budget
 * - Owned items contribute 0 to cost
 * - If over budget, iteratively downgrades slots with least DPS impact per gold saved
 * - Prioritizes keeping high-impact items (weapons) and sacrifices lower-impact slots first
 *
 * The greedy approach may miss synergies (e.g., set bonuses), but provides
 * a fast baseline optimization. Set bonus handling will be added in opt-006/opt-007.
 *
 * @param player - The base player loadout (provides context like skills, prayers, style)
 * @param monster - The monster to optimize against
 * @param options - Optional optimization options (combat style, constraints)
 * @returns An OptimizerResult with the optimized equipment and metrics
 *
 * @example
 * ```typescript
 * const player = getTestPlayer(monster, { equipment: { weapon: whip } });
 * const monster = getTestMonster('Abyssal demon');
 *
 * // Optimize for melee combat
 * const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });
 * console.log(`Optimized DPS: ${result.metrics.dps}`);
 * console.log(`Best weapon: ${result.equipment.weapon?.name}`);
 *
 * // Optimize with budget constraint
 * const budgetResult = optimizeLoadout(player, monster, {
 *   combatStyle: 'melee',
 *   constraints: { maxBudget: 10_000_000 },
 * });
 * console.log(`Budget DPS: ${budgetResult.metrics.dps}, Cost: ${budgetResult.cost.total}`);
 * ```
 */
export function optimizeLoadout(
  player: Player,
  monster: Monster,
  options: OptimizeLoadoutOptions = {},
): OptimizerResult {
  const startTime = performance.now();
  let totalEvaluations = 0;

  const {
    combatStyle, objective = 'dps', constraints, onProgress,
  } = options;

  // Progress tracking
  // Total steps: 1 init + 1 filter + 1 weapon + 1 ammo + 8 slots + 1 sets + 1 budget + 1 complete = 15
  const totalSteps = 15;
  let currentStep = 0;

  const reportProgress = (phase: OptimizerPhase, message?: string, currentBest?: OptimizerResult) => {
    if (onProgress) {
      currentStep += 1;
      const progress = Math.round((currentStep / totalSteps) * 100);
      onProgress({
        phase,
        progress: Math.min(progress, 100),
        currentStep,
        totalSteps,
        message,
        currentBest,
      });
    }
  };

  // Report initialization
  reportProgress('initializing', 'Starting optimization...');

  // Pre-filter equipment by combat style if specified
  let candidatePool = availableEquipment;
  if (combatStyle) {
    candidatePool = filterByCombatStyle(combatStyle, candidatePool);
  }

  // Pre-filter equipment by skill requirements if enforced
  console.debug('[OPT-DEBUG] In optimizeLoadout - enforceSkillReqs:', constraints?.enforceSkillReqs);
  console.debug('[OPT-DEBUG] In optimizeLoadout - playerSkills:', constraints?.playerSkills);
  console.debug('[OPT-DEBUG] Requirements store loaded:', areRequirementsLoaded(), 'size:', getRequirementsStoreSize());
  if (constraints?.enforceSkillReqs && constraints.playerSkills) {
    const beforeCount = candidatePool.length;
    candidatePool = filterBySkillRequirements(constraints.playerSkills, candidatePool);
    console.debug(`[OPT-DEBUG] Filtered by skill reqs: ${beforeCount} -> ${candidatePool.length} items`);
  } else {
    console.debug('[OPT-DEBUG] Skill requirements filtering SKIPPED');
  }

  // Group candidates by slot for faster lookup
  const candidatesBySlot = groupBySlot(candidatePool);

  // Report filtering complete
  reportProgress('filtering', `Filtered to ${candidatePool.length} candidates`);

  // Start with a copy of the player to track progressive equipment changes
  let currentPlayer = { ...player };

  // Build the optimized equipment progressively
  const optimizedEquipment: PlayerEquipment = {
    head: null,
    cape: null,
    neck: null,
    ammo: null,
    weapon: null,
    body: null,
    shield: null,
    legs: null,
    hands: null,
    feet: null,
    ring: null,
  };

  // Step 1: Optimize weapon+shield together (handles 2H vs 1H+shield comparison)
  // Filter out weapons with invalid attack speeds (quest items, crates, etc.)
  const weaponCandidates = filterValidWeapons(candidatesBySlot.weapon);
  const shieldCandidates = candidatesBySlot.shield;

  const weaponShieldResult = findBestWeaponShieldCombination(
    currentPlayer,
    monster,
    weaponCandidates,
    shieldCandidates,
    constraints,
    objective,
  );

  // Track evaluations for weapon and shield
  totalEvaluations += weaponCandidates.length + (weaponShieldResult.is2H ? 0 : shieldCandidates.length);

  // Apply weapon+shield result
  optimizedEquipment.weapon = weaponShieldResult.weapon;
  optimizedEquipment.shield = weaponShieldResult.shield; // null for 2H weapons

  // DEBUG: Log selected weapon and its requirements
  if (weaponShieldResult.weapon) {
    const weaponId = weaponShieldResult.weapon.id;
    const baseId = getBaseItemId(weaponId);
    const weaponReqs = getItemRequirements(weaponId);
    console.debug(`[OPT-DEBUG] Selected weapon: ${weaponShieldResult.weapon.name} (id: ${weaponId})`);
    console.debug(`[OPT-DEBUG] Base item ID: ${baseId} (${baseId === weaponId ? 'same' : 'aliased'})`);
    console.debug('[OPT-DEBUG] Weapon requirements:', weaponReqs);
  }

  // Update current player with weapon
  if (weaponShieldResult.weapon) {
    currentPlayer = createPlayerWithEquipment(currentPlayer, 'weapon', weaponShieldResult.weapon, monster);
  }

  // Update current player with shield (if not using 2H)
  if (weaponShieldResult.shield) {
    currentPlayer = createPlayerWithEquipment(currentPlayer, 'shield', weaponShieldResult.shield, monster);
  }

  // Report weapon optimization complete
  const weaponName = weaponShieldResult.weapon?.name || 'None';
  reportProgress('weapons', `Selected ${weaponName}${weaponShieldResult.is2H ? ' (2H)' : ''}`);

  // Step 2: Optimize ammunition or blowpipe darts
  // Must be done after weapon selection to know valid ammo/dart types
  const ammoCandidates = candidatesBySlot.ammo;
  const weaponId = optimizedEquipment.weapon?.id;

  if (weaponId && weaponRequiresAmmo(weaponId)) {
    // Regular ranged weapon - find the best ammo
    const ammoResult = findBestAmmoForWeapon(currentPlayer, monster, ammoCandidates, constraints, objective);
    totalEvaluations += ammoResult.candidates.length;

    optimizedEquipment.ammo = ammoResult.bestItem;

    if (ammoResult.bestItem) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, 'ammo', ammoResult.bestItem, monster);
    }
    reportProgress('ammunition', `Selected ${ammoResult.bestItem?.name || 'None'}`);
  } else if (isBlowpipeWeapon(optimizedEquipment.weapon)) {
    // Blowpipe - find the best dart and set it in itemVars
    // Darts are weapon-slot items, not ammo-slot items
    const allDarts = getDartItems();
    const dartResult = findBestDartForBlowpipe(currentPlayer, monster, allDarts, constraints, objective);
    totalEvaluations += dartResult.candidates.length;

    if (dartResult.bestDart && optimizedEquipment.weapon) {
      // Create a new blowpipe with the selected dart in itemVars
      optimizedEquipment.weapon = createBlowpipeWithDart(optimizedEquipment.weapon, dartResult.bestDart);
      currentPlayer = createPlayerWithEquipment(currentPlayer, 'weapon', optimizedEquipment.weapon, monster);
    }

    // Blowpipes don't use the ammo slot for DPS contribution
    optimizedEquipment.ammo = null;
    reportProgress('ammunition', `Selected ${dartResult.bestDart?.name || 'None'} dart`);
  } else {
    // Weapon doesn't require ammo (melee, powered staves, etc.)
    // Note: Some items could still be useful in ammo slot for defensive stats,
    // but for DPS optimization we skip them as they don't contribute
    optimizedEquipment.ammo = null;
    reportProgress('ammunition', 'No ammunition needed');
  }

  // Step 3: Optimize remaining slots (excluding weapon, shield, and ammo)
  for (const slot of SLOT_OPTIMIZATION_ORDER_NON_WEAPON) {
    const candidates = candidatesBySlot[slot];

    // Find the best item for this slot
    const result = findBestItemForSlot(slot, currentPlayer, monster, candidates, constraints, objective);
    totalEvaluations += result.candidates.length;

    // Update the optimized equipment
    optimizedEquipment[slot] = result.bestItem;

    // Update the current player with the new equipment for the next iteration
    // This ensures subsequent slot evaluations account for the already-selected items
    if (result.bestItem) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, slot, result.bestItem, monster);
    }

    // Report progress for each slot
    reportProgress('slots', `Optimized ${slot}: ${result.bestItem?.name || 'None'}`);
  }

  // Step 4 (opt-007): Compare set bonuses vs greedy result
  // Calculate the greedy score to compare against
  const greedyPlayer = createPlayerFromEquipment(player, optimizedEquipment, monster);
  const greedyMetrics = calculateMetrics(greedyPlayer, monster);
  const greedyScore = getScoreForObjective(greedyMetrics, objective);

  // Check if any set bonus loadout beats the greedy result
  const bestSetResult = findBestSetBonusLoadout(
    player,
    monster,
    combatStyle,
    candidatesBySlot,
    greedyScore,
    constraints,
    objective,
  );

  // Use the better of greedy vs set bonus loadout
  let bestEquipment = optimizedEquipment;
  if (bestSetResult) {
    // A set bonus loadout beat the greedy result
    bestEquipment = bestSetResult.equipment;
    reportProgress('set_bonuses', `Using ${bestSetResult.setType || 'set'} bonus loadout`);
  } else {
    reportProgress('set_bonuses', 'No set bonus better than individual items');
  }

  // Step 5: Apply budget constraint if specified
  let finalEquipment = bestEquipment;
  let costInfo = calculateLoadoutCost(bestEquipment, constraints?.ownedItems);

  if (constraints?.maxBudget !== undefined && costInfo.total > constraints.maxBudget) {
    // Need to fit within budget - iteratively downgrade lower-impact slots
    const budgetResult = applyBudgetConstraint(
      bestEquipment,
      player,
      monster,
      constraints.maxBudget,
      candidatesBySlot,
      constraints,
    );
    finalEquipment = budgetResult.equipment;
    costInfo = budgetResult.cost;
    reportProgress('budget', `Adjusted to fit budget (${costInfo.total} GP)`);
  } else {
    reportProgress('budget', 'Within budget');
  }

  // Calculate final metrics with the complete loadout
  const finalPlayer = createPlayerFromEquipment(player, finalEquipment, monster);
  const calc = new PlayerVsNPCCalc(finalPlayer, monster);
  const dps = calc.getDps();
  const accuracy = calc.getHitChance();
  const maxHit = calc.getMax();

  const endTime = performance.now();

  const result: OptimizerResult = {
    equipment: finalEquipment,
    metrics: {
      dps,
      accuracy,
      maxHit,
    },
    cost: costInfo,
    meta: {
      evaluations: totalEvaluations,
      timeMs: endTime - startTime,
    },
  };

  // Report completion with final result
  reportProgress('complete', 'Optimization complete', result);

  return result;
}
