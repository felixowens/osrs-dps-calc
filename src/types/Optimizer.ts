import { EquipmentPiece, PlayerEquipment, PlayerSkills } from '@/types/Player';

/**
 * The 11 equipment slots that can be optimized.
 */
export type EquipmentSlot = keyof PlayerEquipment;

/**
 * Skill requirements for an equipment item.
 * Maps skill names to required levels.
 */
export interface SkillRequirements {
  attack?: number;
  strength?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  prayer?: number;
  hitpoints?: number;
  mining?: number;
  slayer?: number;
  agility?: number;
  herblore?: number;
  thieving?: number;
  crafting?: number;
  fletching?: number;
  hunter?: number;
  construction?: number;
  firemaking?: number;
  farming?: number;
  woodcutting?: number;
  fishing?: number;
  cooking?: number;
  smithing?: number;
  runecrafting?: number;
  combat?: number;
}

/**
 * Price information for an item.
 */
export interface ItemPrice {
  /** The item's price in GP (null if price is unknown) */
  price: number | null;
  /** Whether the item is tradeable on the Grand Exchange */
  isTradeable: boolean;
}

/**
 * All available equipment slots.
 */
export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'head',
  'cape',
  'neck',
  'ammo',
  'weapon',
  'body',
  'shield',
  'legs',
  'hands',
  'feet',
  'ring',
];

/**
 * Combat styles that can be optimized for.
 */
export type CombatStyle = 'melee' | 'ranged' | 'magic';

/**
 * Optimization objectives.
 */
export type OptimizationObjective = 'dps' | 'accuracy' | 'max_hit';

/**
 * Constraints that can be applied during optimization.
 */
export interface OptimizerConstraints {
  /** Maximum total GP to spend */
  maxBudget?: number;
  /** Item IDs the user owns (considered free, price = 0) */
  ownedItems?: Set<number>;
  /** Item IDs to never use */
  blacklistedItems?: Set<number>;
  /** Only show items the player can equip based on skill requirements */
  enforceSkillReqs?: boolean;
  /** Player skills for requirement checking */
  playerSkills?: PlayerSkills;
}

/**
 * Result of evaluating a single item's contribution.
 */
export interface ItemEvaluation {
  item: EquipmentPiece;
  score: number;
  dps: number;
}

/**
 * Result of optimizing a single slot.
 */
export interface SlotOptimizationResult {
  slot: EquipmentSlot;
  bestItem: EquipmentPiece | null;
  score: number;
  candidates: ItemEvaluation[];
}

/**
 * Full optimization result.
 */
export interface OptimizerResult {
  /** The optimized loadout */
  equipment: PlayerEquipment;

  /** Performance metrics */
  metrics: {
    dps: number;
    accuracy: number;
    maxHit: number;
  };

  /** Cost breakdown */
  cost: {
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
  };

  /** Search metadata */
  meta: {
    evaluations: number;
    timeMs: number;
  };
}
