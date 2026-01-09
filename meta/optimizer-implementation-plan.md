# Gear Optimizer Implementation Plan

**Created:** 2026-01-09
**Target:** osrs-dps-calc

## Overview

The osrs-dps-calc is a sophisticated Next.js/TypeScript app with:
- **4,000+ equipment items** across 11 slots
- **2,000+ monsters** with full combat stats
- A battle-tested DPS calculation engine (`PlayerVsNPCCalc`)
- Web Worker architecture for non-blocking calculations
- MobX state management

---

## What an MVP Optimizer Would Need

### 1. Input Requirements

| Input | Status | Notes |
|-------|--------|-------|
| Player stats (levels, prayers, potions) | ✅ Already tracked | |
| Combat style (melee/ranged/magic) | ✅ Already tracked | |
| Target monster | ✅ Already tracked | |
| Budget constraint | ❌ NOT tracked | Needs GE prices |
| Owned items / blacklist | ❌ NOT tracked | New feature |
| Skill requirements | ⚠️ Partial | In equipment data but not enforced |

### 2. Core Algorithm Options

The search space is huge: `~4000 items × 11 slots`.

| Approach | Pros | Cons |
|----------|------|------|
| **Greedy per-slot** | Fast, simple MVP | Misses synergies (e.g., Void sets) |
| **Genetic algorithm** | Handles constraints well | Complex to tune |
| **Beam search** | Good balance | Still expensive |
| **Exhaustive + pruning** | Optimal results | Slow for full search |

**MVP recommendation**: Greedy per-slot with set bonuses as special cases.

### 3. Data Gaps to Fill

| Missing Data | Source | Priority |
|--------------|--------|----------|
| GE prices | OSRS Wiki API / Gearscape | High (for budget) |
| Item ownership | User input | High |
| Skill requirements | Already in equipment.json | Medium |
| Quest requirements | OSRS Wiki | Low |

The Gearscape API (documented in `gearscape-api.md`) provides prices but their monster data is incomplete.

---

## Architecture

### New Files Needed

```
src/
├── lib/
│   └── Optimizer.ts              # Search algorithm
├── worker/
│   └── (add OPTIMIZE request type to existing worker.ts)
├── types/
│   └── Optimizer.ts              # Input/result types
└── app/components/
    └── optimizer/
        ├── OptimizerModal.tsx    # Main modal container
        ├── OptimizerSettings.tsx # Budget, blacklist, constraints
        └── OptimizerResults.tsx  # Display top N results
```

### Key Existing Files to Modify/Leverage

| File | Purpose | Size |
|------|---------|------|
| `/src/lib/PlayerVsNPCCalc.ts` | Evaluation engine | 93KB |
| `/src/state.tsx` | State management | 26KB |
| `/src/lib/Equipment.ts` | Equipment handling | 18KB |
| `/src/worker/worker.ts` | Worker setup | 8.7KB |
| `/src/types/Player.ts` | Player types | - |
| `/src/types/State.ts` | State types | - |
| `/cdn/json/equipment.json` | Equipment database | 157KB |

### Type Definitions

```typescript
// src/types/Optimizer.ts

interface OptimizerInput {
  // What to optimize for
  objective: 'dps' | 'accuracy' | 'max_hit' | 'ttk';

  // Combat style to optimize
  combatStyle: 'melee' | 'ranged' | 'magic';

  // Constraints
  constraints: {
    maxBudget?: number;           // Max total GP to spend
    ownedItems?: number[];        // Item IDs the user owns (no cost)
    blacklistedItems?: number[];  // Item IDs to never use
    blacklistedEffects?: string[]; // e.g., "vengeance", "special_attack"
    enforceSkillReqs?: boolean;   // Only show items player can equip
  };

  // Player context (skills, prayers, etc.)
  playerContext: {
    skills: PlayerSkills;
    prayers: Prayer[];
    boosts: PlayerSkills;
    buffs: PlayerBuffs;
  };

  // Target
  monster: Monster;
}

interface OptimizerResult {
  // The optimized loadout
  equipment: PlayerEquipment;

  // How it performs
  metrics: {
    dps: number;
    accuracy: number;
    maxHit: number;
    ttk: number;
  };

  // Cost breakdown
  cost: {
    total: number;
    perSlot: Record<EquipmentSlot, number>;
  };

  // Search metadata
  meta: {
    evaluations: number;
    timeMs: number;
  };
}

interface OptimizerProgress {
  phase: 'filtering' | 'evaluating' | 'complete';
  progress: number; // 0-100
  currentBest?: OptimizerResult;
}
```

---

## Implementation Steps

### Phase 1: Data Foundation

1. **Add price data to equipment**
   - Fetch from OSRS Wiki GE API or Gearscape
   - Store in equipment.json or separate prices.json
   - Add price field to equipment types

2. **Add owned items storage**
   - localStorage persistence
   - UI for marking items as owned
   - Import from Runelite bank export (stretch goal)

### Phase 2: Core Algorithm

3. **Implement equipment filtering**
   ```typescript
   function filterEquipment(
     allEquipment: Equipment[],
     slot: EquipmentSlot,
     combatStyle: CombatStyle,
     constraints: OptimizerConstraints
   ): Equipment[]
   ```
   - Filter by slot
   - Filter by combat style relevance
   - Filter by skill requirements (if enforced)
   - Filter out blacklisted items
   - Filter by budget (if set)

4. **Implement greedy per-slot optimizer**
   ```typescript
   function optimizeGreedy(input: OptimizerInput): OptimizerResult
   ```
   - For each slot, find best item by contribution to objective
   - Handle two-handed weapons (skip shield)
   - Handle ammo requirements

5. **Add set bonus awareness**
   - Detect when set bonuses would outperform greedy selection
   - Special handling for: Void, Inquisitor, Obsidian, Dharok's, etc.

### Phase 3: Worker Integration

6. **Add optimizer to worker**
   - New `WorkerRequestType.OPTIMIZE`
   - Progress callbacks for long-running searches
   - Cancellation support

### Phase 4: UI

7. **Optimizer settings modal**
   - Budget slider
   - Combat style selector
   - Owned items manager
   - Blacklist manager
   - Objective selector

8. **Results display**
   - Show top N loadouts
   - Compare to current loadout
   - One-click apply to loadout slot

---

## Special Cases to Handle

### Set Bonuses
| Set | Bonus | Slots |
|-----|-------|-------|
| Void Knight | +10% accuracy/damage | Head, body, legs, hands |
| Elite Void | +12.5% ranged damage | Head, body, legs, hands |
| Inquisitor's | Crush accuracy/damage | Head, body, legs |
| Obsidian | +10% melee | Head, body, legs, weapon |
| Dharok's | Damage scales with missing HP | Full set |
| Slayer helmet | +16.67% on task | Head only |

### Weapon-Specific Requirements
- **Blowpipe**: Requires dart selection (affects stats)
- **Powered staves**: Built-in spell, no ammo
- **Crossbows**: Bolt type affects damage
- **Bows**: Arrow type affects damage

### Two-Handed Weapons
- Skip shield slot evaluation
- Compare 2H vs 1H+shield combinations

---

## Complexity Estimate

| Component | Effort | Notes |
|-----------|--------|-------|
| Price data integration | Medium | API integration, caching |
| Basic optimizer algorithm | Medium | Greedy is straightforward |
| Owned items tracking | Low | localStorage pattern exists |
| UI for inputs | Medium | Follow existing modal patterns |
| Set bonus handling | High | Many edge cases |
| Worker integration | Low | Pattern already established |
| Testing | Medium | Verify against manual selections |

---

## Performance Considerations

1. **Pre-filter aggressively** - Reduce candidate pool before evaluation
2. **Cache equipment stats** - Avoid repeated lookups
3. **Early termination** - Stop if result is "good enough"
4. **Slot ordering** - Evaluate weapon first (biggest impact)
5. **Parallel evaluation** - Consider multiple workers for top N search

---

## Future Enhancements (Post-MVP)

- Import owned items from Runelite bank
- Multi-objective optimization (DPS vs survivability)
- Raid-specific optimization (ToA, CoX, ToB scaling)
- Save/share optimized loadouts
- "Upgrade path" suggestions (what to buy next)
- Account-wide optimization across multiple targets
