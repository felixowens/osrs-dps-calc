import { EquipmentPiece } from '@/types/Player';
import { CombatStyle, EquipmentSlot, EQUIPMENT_SLOTS } from '@/types/Optimizer';
import { availableEquipment } from '@/lib/Equipment';

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
