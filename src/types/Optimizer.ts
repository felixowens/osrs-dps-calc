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
 * Known set bonus types that the optimizer can detect and evaluate.
 */
export type SetBonusType =
  | 'void_melee'
  | 'void_ranged'
  | 'void_magic'
  | 'elite_void_ranged'
  | 'elite_void_magic'
  | 'inquisitor'
  | 'obsidian';

/**
 * Definition of a set bonus, including the pieces required and the combat style it benefits.
 */
export interface SetBonusDefinition {
  /** Unique identifier for this set */
  type: SetBonusType;
  /** Display name for the set */
  name: string;
  /** Combat style this set benefits (null if benefits multiple or special) */
  combatStyle: CombatStyle | null;
  /** Item names required to complete the set, mapped by slot */
  pieces: Partial<Record<EquipmentSlot, string[]>>;
  /** Description of the bonus */
  bonus: string;
}

/**
 * Result of detecting a set bonus opportunity.
 */
export interface SetBonusDetectionResult {
  /** The set type detected */
  type: SetBonusType;
  /** Whether all pieces are available in candidates */
  available: boolean;
  /** Whether all pieces can be equipped (pass skill requirements, budget, etc.) */
  canEquip: boolean;
  /** The equipment pieces that would form the set */
  pieces: Partial<PlayerEquipment>;
  /** Which pieces are missing from candidates */
  missingPieces: EquipmentSlot[];
}

/**
 * Optimization phases for progress reporting.
 */
export type OptimizerPhase =
  | 'initializing'
  | 'filtering'
  | 'weapons'
  | 'ammunition'
  | 'slots'
  | 'set_bonuses'
  | 'budget'
  | 'complete';

/**
 * Progress update during optimization.
 */
export interface OptimizerProgress {
  /** Current phase of optimization */
  phase: OptimizerPhase;
  /** Overall progress percentage (0-100) */
  progress: number;
  /** Current step number */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Optional message describing current activity */
  message?: string;
  /** Current best result (available during later phases) */
  currentBest?: OptimizerResult;
}

/**
 * Callback function for receiving progress updates during optimization.
 */
export type OptimizerProgressCallback = (progress: OptimizerProgress) => void;

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
