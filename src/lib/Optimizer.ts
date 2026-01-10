import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { Monster } from '@/types/Monster';
import {
  CombatStyle, EquipmentSlot, EQUIPMENT_SLOTS, ItemEvaluation, ItemPrice,
  OptimizerConstraints, OptimizerResult, SlotOptimizationResult,
} from '@/types/Optimizer';
import {
  AmmoApplicability, ammoApplicability, availableEquipment, calculateEquipmentBonusesFromGear,
} from '@/lib/Equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';

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
// Cost Calculation
// ============================================================================

/**
 * Calculate the total cost of a loadout.
 *
 * Sums up the effective price of all equipped items. Owned items contribute 0 to cost.
 * Items with unknown prices are treated as 0 cost (to avoid blocking optimization).
 *
 * @param equipment - The equipment loadout to calculate cost for
 * @param ownedItems - Optional set of owned item IDs (owned items are free)
 * @returns Object with total cost and per-slot cost breakdown
 */
export function calculateLoadoutCost(
  equipment: PlayerEquipment,
  ownedItems?: Set<number>,
): { total: number; perSlot: Partial<Record<EquipmentSlot, number>> } {
  let total = 0;
  const perSlot: Partial<Record<EquipmentSlot, number>> = {};

  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment[slot];
    if (item) {
      const price = getEffectivePrice(item.id, ownedItems);
      // Treat unknown prices as 0 to avoid blocking
      const cost = price ?? 0;
      perSlot[slot] = cost;
      total += cost;
    }
  }

  return { total, perSlot };
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
 * Evaluate a single equipment item's contribution to DPS.
 *
 * Given a current loadout and a candidate item, this function calculates
 * the DPS with the candidate item equipped. The result includes the DPS value
 * and can be compared against other items or the baseline loadout.
 *
 * This function uses the existing PlayerVsNPCCalc for accurate DPS calculations.
 *
 * @param player - The current player loadout (used as baseline)
 * @param monster - The monster to calculate DPS against
 * @param candidateItem - The equipment item to evaluate
 * @returns An ItemEvaluation containing the item, DPS, and score
 *
 * @example
 * ```typescript
 * const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });
 * const monster = getTestMonster('Abyssal demon');
 * const rapier = findEquipment('Ghrazi rapier');
 *
 * // Evaluate how rapier would perform in this loadout
 * const evaluation = evaluateItem(player, monster, rapier);
 * console.log(`Rapier DPS: ${evaluation.dps}`);
 * ```
 */
export function evaluateItem(
  player: Player,
  monster: Monster,
  candidateItem: EquipmentPiece,
): ItemEvaluation {
  // Determine which slot the item goes in
  const slot = candidateItem.slot as EquipmentSlot;

  // Create a player with the candidate item equipped
  const playerWithItem = createPlayerWithEquipment(player, slot, candidateItem, monster);

  // Calculate DPS with the new item
  const dps = calculateDps(playerWithItem, monster);

  return {
    item: candidateItem,
    dps,
    score: dps, // For now, score equals DPS. Future objectives may use different scores.
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
 * candidate's DPS contribution and returns the best one along with all
 * evaluations sorted by score.
 *
 * This function respects constraints if provided:
 * - Blacklisted items are excluded from consideration
 * - Budget constraints filter out items that are too expensive (requires price data)
 * - Skill requirements filter out items the player cannot equip
 *
 * @param slot - The equipment slot to optimize
 * @param player - The current player loadout (used as context for DPS calculation)
 * @param monster - The monster to calculate DPS against
 * @param candidates - Optional array of candidate items. If not provided, all items
 *                     for the slot are used (filtered from available equipment).
 * @param constraints - Optional constraints to apply (blacklist, budget, etc.)
 * @returns A SlotOptimizationResult containing the best item, score, and all candidates
 *
 * @example
 * ```typescript
 * const player = getTestPlayer(monster, { equipment: { weapon: whip } });
 * const monster = getTestMonster('Abyssal demon');
 *
 * // Find best weapon with no constraints
 * const result = findBestItemForSlot('weapon', player, monster);
 * console.log(`Best weapon: ${result.bestItem?.name} with DPS: ${result.score}`);
 *
 * // Find best weapon from a filtered list
 * const meleeWeapons = filterByCombatStyle('melee', filterBySlot('weapon'));
 * const result2 = findBestItemForSlot('weapon', player, monster, meleeWeapons);
 * ```
 */
export function findBestItemForSlot(
  slot: EquipmentSlot,
  player: Player,
  monster: Monster,
  candidates?: EquipmentPiece[],
  constraints?: OptimizerConstraints,
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

  // Evaluate all candidates
  const evaluations: ItemEvaluation[] = items.map((item) => evaluateItem(player, monster, item));

  // Sort by score descending (highest DPS first)
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
 * ammunition that produces the highest DPS.
 *
 * @param player - The base player loadout (with weapon already equipped)
 * @param monster - The monster to optimize against
 * @param ammoCandidates - Candidate ammo items (should be pre-filtered to valid ammo)
 * @param constraints - Optional constraints to apply
 * @returns SlotOptimizationResult with the best ammo
 */
export function findBestAmmoForWeapon(
  player: Player,
  monster: Monster,
  ammoCandidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
): SlotOptimizationResult {
  // Get the weapon ID from the player's equipment
  const weaponId = player.equipment.weapon?.id;

  if (!weaponId || !weaponRequiresAmmo(weaponId)) {
    // Weapon doesn't require ammo, return empty result
    return {
      slot: 'ammo',
      bestItem: null,
      score: calculateDps(player, monster), // DPS without ammo
      candidates: [],
    };
  }

  // Filter to valid ammo for this weapon
  const validAmmo = filterValidAmmoForWeapon(weaponId, ammoCandidates);

  // Use findBestItemForSlot with the filtered ammo
  return findBestItemForSlot('ammo', player, monster, validAmmo, constraints);
}

/**
 * Find the best weapon+shield combination.
 *
 * This function handles the comparison between:
 * 1. Best two-handed weapon (no shield)
 * 2. Best one-handed weapon + best shield
 *
 * It returns the combination that produces the highest DPS.
 *
 * @param player - The base player loadout
 * @param monster - The monster to optimize against
 * @param weaponCandidates - Candidate weapons (filtered by style, etc.)
 * @param shieldCandidates - Candidate shields
 * @param constraints - Optional constraints to apply
 * @returns Object containing the best weapon, shield (or null for 2H), and combined DPS
 */
export function findBestWeaponShieldCombination(
  player: Player,
  monster: Monster,
  weaponCandidates: EquipmentPiece[],
  shieldCandidates: EquipmentPiece[],
  constraints?: OptimizerConstraints,
): { weapon: EquipmentPiece | null; shield: EquipmentPiece | null; dps: number; is2H: boolean } {
  // Separate weapons into 1H and 2H
  const oneHandedWeapons = filterOneHandedWeapons(weaponCandidates);
  const twoHandedWeapons = filterTwoHandedWeapons(weaponCandidates);

  let best2HDps = 0;
  let best2HWeapon: EquipmentPiece | null = null;

  let best1HComboDps = 0;
  let best1HWeapon: EquipmentPiece | null = null;
  let bestShield: EquipmentPiece | null = null;

  // Evaluate best 2H weapon
  if (twoHandedWeapons.length > 0) {
    const result2H = findBestItemForSlot('weapon', player, monster, twoHandedWeapons, constraints);
    if (result2H.bestItem) {
      best2HWeapon = result2H.bestItem;
      best2HDps = result2H.score;
    }
  }

  // Evaluate best 1H + shield combination
  if (oneHandedWeapons.length > 0) {
    // Find best 1H weapon first
    const result1H = findBestItemForSlot('weapon', player, monster, oneHandedWeapons, constraints);
    if (result1H.bestItem) {
      best1HWeapon = result1H.bestItem;

      // Create player with best 1H weapon to evaluate shields
      const playerWith1H = createPlayerWithEquipment(player, 'weapon', best1HWeapon, monster);

      // Find best shield with the 1H weapon equipped
      if (shieldCandidates.length > 0) {
        const resultShield = findBestItemForSlot('shield', playerWith1H, monster, shieldCandidates, constraints);
        if (resultShield.bestItem) {
          bestShield = resultShield.bestItem;
          // The shield result's score is the DPS with both 1H and shield equipped
          best1HComboDps = resultShield.score;
        } else {
          // No valid shield, use 1H weapon DPS alone
          best1HComboDps = result1H.score;
        }
      } else {
        // No shield candidates, use 1H weapon DPS alone
        best1HComboDps = result1H.score;
      }
    }
  }

  // Compare 2H vs 1H+shield and return the better option
  if (best2HDps >= best1HComboDps && best2HWeapon) {
    return {
      weapon: best2HWeapon,
      shield: null, // 2H weapons cannot use shield
      dps: best2HDps,
      is2H: true,
    };
  }

  return {
    weapon: best1HWeapon,
    shield: bestShield,
    dps: best1HComboDps,
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
): { equipment: PlayerEquipment; cost: { total: number; perSlot: Partial<Record<EquipmentSlot, number>> } } {
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
  /** Constraints to apply during optimization */
  constraints?: OptimizerConstraints;
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

  const { combatStyle, constraints } = options;

  // Pre-filter equipment by combat style if specified
  let candidatePool = availableEquipment;
  if (combatStyle) {
    candidatePool = filterByCombatStyle(combatStyle, candidatePool);
  }

  // Group candidates by slot for faster lookup
  const candidatesBySlot = groupBySlot(candidatePool);

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
  const weaponCandidates = candidatesBySlot.weapon;
  const shieldCandidates = candidatesBySlot.shield;

  const weaponShieldResult = findBestWeaponShieldCombination(
    currentPlayer,
    monster,
    weaponCandidates,
    shieldCandidates,
    constraints,
  );

  // Track evaluations for weapon and shield
  totalEvaluations += weaponCandidates.length + (weaponShieldResult.is2H ? 0 : shieldCandidates.length);

  // Apply weapon+shield result
  optimizedEquipment.weapon = weaponShieldResult.weapon;
  optimizedEquipment.shield = weaponShieldResult.shield; // null for 2H weapons

  // Update current player with weapon
  if (weaponShieldResult.weapon) {
    currentPlayer = createPlayerWithEquipment(currentPlayer, 'weapon', weaponShieldResult.weapon, monster);
  }

  // Update current player with shield (if not using 2H)
  if (weaponShieldResult.shield) {
    currentPlayer = createPlayerWithEquipment(currentPlayer, 'shield', weaponShieldResult.shield, monster);
  }

  // Step 2: Optimize ammunition (must be done after weapon selection to know valid ammo types)
  // Only if the selected weapon requires ammunition
  const ammoCandidates = candidatesBySlot.ammo;
  const weaponId = optimizedEquipment.weapon?.id;

  if (weaponId && weaponRequiresAmmo(weaponId)) {
    // Filter to valid ammo for this weapon and find the best
    const ammoResult = findBestAmmoForWeapon(currentPlayer, monster, ammoCandidates, constraints);
    totalEvaluations += ammoResult.candidates.length;

    optimizedEquipment.ammo = ammoResult.bestItem;

    if (ammoResult.bestItem) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, 'ammo', ammoResult.bestItem, monster);
    }
  } else {
    // Weapon doesn't require ammo, skip ammo slot (leave as null)
    // Note: Some items could still be useful in ammo slot for defensive stats,
    // but for DPS optimization we skip them as they don't contribute
    optimizedEquipment.ammo = null;
  }

  // Step 3: Optimize remaining slots (excluding weapon, shield, and ammo)
  for (const slot of SLOT_OPTIMIZATION_ORDER_NON_WEAPON) {
    const candidates = candidatesBySlot[slot];

    // Find the best item for this slot
    const result = findBestItemForSlot(slot, currentPlayer, monster, candidates, constraints);
    totalEvaluations += result.candidates.length;

    // Update the optimized equipment
    optimizedEquipment[slot] = result.bestItem;

    // Update the current player with the new equipment for the next iteration
    // This ensures subsequent slot evaluations account for the already-selected items
    if (result.bestItem) {
      currentPlayer = createPlayerWithEquipment(currentPlayer, slot, result.bestItem, monster);
    }
  }

  // Step 4: Apply budget constraint if specified
  let finalEquipment = optimizedEquipment;
  let costInfo = calculateLoadoutCost(optimizedEquipment, constraints?.ownedItems);

  if (constraints?.maxBudget !== undefined && costInfo.total > constraints.maxBudget) {
    // Need to fit within budget - iteratively downgrade lower-impact slots
    const budgetResult = applyBudgetConstraint(
      optimizedEquipment,
      player,
      monster,
      constraints.maxBudget,
      candidatesBySlot,
      constraints,
    );
    finalEquipment = budgetResult.equipment;
    costInfo = budgetResult.cost;
  }

  // Calculate final metrics with the complete loadout
  const finalPlayer = createPlayerFromEquipment(player, finalEquipment, monster);
  const calc = new PlayerVsNPCCalc(finalPlayer, monster);
  const dps = calc.getDps();
  const accuracy = calc.getHitChance();
  const maxHit = calc.getMax();

  const endTime = performance.now();

  return {
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
}
