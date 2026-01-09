import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { Monster } from '@/types/Monster';
import {
  CombatStyle, EquipmentSlot, EQUIPMENT_SLOTS, ItemEvaluation,
  OptimizerConstraints, SlotOptimizationResult,
} from '@/types/Optimizer';
import { availableEquipment, calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
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
