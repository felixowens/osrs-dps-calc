import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { Monster } from '@/types/Monster';
import {
  CombatStyle, EquipmentSlot, EQUIPMENT_SLOTS, ItemEvaluation,
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
 * 5. Returns the complete optimized loadout with metrics
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

  // Calculate final metrics with the complete loadout
  const finalPlayer = createPlayerFromEquipment(player, optimizedEquipment, monster);
  const calc = new PlayerVsNPCCalc(finalPlayer, monster);
  const dps = calc.getDps();
  const accuracy = calc.getHitChance();
  const maxHit = calc.getMax();

  const endTime = performance.now();

  return {
    equipment: optimizedEquipment,
    metrics: {
      dps,
      accuracy,
      maxHit,
    },
    cost: {
      total: 0, // Price data not yet implemented (data-001)
      perSlot: {}, // Price data not yet implemented (data-001)
    },
    meta: {
      evaluations: totalEvaluations,
      timeMs: endTime - startTime,
    },
  };
}
