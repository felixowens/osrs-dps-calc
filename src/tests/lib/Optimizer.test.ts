import { describe, expect, test } from '@jest/globals';
import {
  filterBySlot, filterByCombatStyle, evaluateItem, evaluateItemDelta, calculateDps, createPlayerWithEquipment,
  findBestItemForSlot, optimizeLoadout,
  isTwoHandedWeapon, filterOneHandedWeapons, filterTwoHandedWeapons, findBestWeaponShieldCombination,
} from '@/lib/Optimizer';
import { availableEquipment } from '@/lib/Equipment';
import { findEquipment, getTestMonster, getTestPlayer } from '@/tests/utils/TestUtils';

describe('Optimizer', () => {
  describe('filterBySlot', () => {
    test('filters weapons correctly', () => {
      const weapons = filterBySlot('weapon');
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((item) => item.slot === 'weapon')).toBe(true);
    });

    test('filters all 11 slots', () => {
      const slots = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'] as const;
      for (const slot of slots) {
        const items = filterBySlot(slot);
        expect(items.length).toBeGreaterThan(0);
        expect(items.every((item) => item.slot === slot)).toBe(true);
      }
    });
  });

  describe('filterByCombatStyle', () => {
    describe('melee style', () => {
      test('includes items with melee offensive bonuses', () => {
        const meleeItems = filterByCombatStyle('melee');

        // Abyssal whip has slash bonus
        const whip = findEquipment('Abyssal whip');
        expect(meleeItems).toContain(whip);

        // Fighter torso has strength bonus
        const torso = findEquipment('Fighter torso');
        expect(meleeItems).toContain(torso);
      });

      test('excludes pure ranged items', () => {
        const meleeItems = filterByCombatStyle('melee');

        // Twisted bow is ranged only
        const tbow = findEquipment('Twisted bow');
        expect(meleeItems).not.toContain(tbow);
      });

      test('excludes pure magic items', () => {
        const meleeItems = filterByCombatStyle('melee');

        // Ancestral hat is magic only
        const ancestral = findEquipment('Ancestral hat');
        expect(meleeItems).not.toContain(ancestral);
      });
    });

    describe('ranged style', () => {
      test('includes items with ranged offensive bonuses', () => {
        const rangedItems = filterByCombatStyle('ranged');

        // Twisted bow has ranged bonus
        const tbow = findEquipment('Twisted bow');
        expect(rangedItems).toContain(tbow);

        // Armadyl chestplate has ranged bonus
        const armaChest = findEquipment('Armadyl chestplate');
        expect(rangedItems).toContain(armaChest);
      });

      test('excludes pure melee items', () => {
        const rangedItems = filterByCombatStyle('ranged');

        // Abyssal whip is melee only
        const whip = findEquipment('Abyssal whip');
        expect(rangedItems).not.toContain(whip);
      });

      test('excludes pure magic items', () => {
        const rangedItems = filterByCombatStyle('ranged');

        // Ancestral hat is magic only
        const ancestral = findEquipment('Ancestral hat');
        expect(rangedItems).not.toContain(ancestral);
      });
    });

    describe('magic style', () => {
      test('includes items with magic offensive bonuses', () => {
        const magicItems = filterByCombatStyle('magic');

        // Ancestral hat has magic bonus
        const ancestral = findEquipment('Ancestral hat');
        expect(magicItems).toContain(ancestral);

        // Occult necklace has magic damage bonus
        const occult = findEquipment('Occult necklace');
        expect(magicItems).toContain(occult);
      });

      test('excludes pure melee items', () => {
        const magicItems = filterByCombatStyle('magic');

        // Abyssal whip is melee only
        const whip = findEquipment('Abyssal whip');
        expect(magicItems).not.toContain(whip);
      });

      test('excludes pure ranged items', () => {
        const magicItems = filterByCombatStyle('magic');

        // Twisted bow is ranged only
        const tbow = findEquipment('Twisted bow');
        expect(magicItems).not.toContain(tbow);
      });
    });

    describe('neutral/defensive items', () => {
      test('includes items with no offensive bonuses in all styles', () => {
        const meleeItems = filterByCombatStyle('melee');
        const rangedItems = filterByCombatStyle('ranged');
        const magicItems = filterByCombatStyle('magic');

        // Find an item with no offensive bonuses (like a ring of recoil or defensive body)
        const neutralItems = availableEquipment.filter((item) => {
          const hasOffensive = item.offensive.stab > 0
            || item.offensive.slash > 0
            || item.offensive.crush > 0
            || item.offensive.ranged > 0
            || item.offensive.magic > 0
            || item.bonuses.str > 0
            || item.bonuses.ranged_str > 0
            || item.bonuses.magic_str > 0;
          return !hasOffensive;
        });

        // All neutral items should be in all three combat style lists
        for (const item of neutralItems.slice(0, 10)) { // Check first 10 for performance
          expect(meleeItems).toContain(item);
          expect(rangedItems).toContain(item);
          expect(magicItems).toContain(item);
        }
      });
    });

    describe('chaining with slot filter', () => {
      test('can filter by slot then by combat style', () => {
        const allWeapons = filterBySlot('weapon');
        const meleeWeapons = filterByCombatStyle('melee', allWeapons);
        const rangedWeapons = filterByCombatStyle('ranged', allWeapons);
        const magicWeapons = filterByCombatStyle('magic', allWeapons);

        // All filtered results should be weapons
        expect(meleeWeapons.every((w) => w.slot === 'weapon')).toBe(true);
        expect(rangedWeapons.every((w) => w.slot === 'weapon')).toBe(true);
        expect(magicWeapons.every((w) => w.slot === 'weapon')).toBe(true);

        // Should have meaningful counts
        expect(meleeWeapons.length).toBeGreaterThan(100);
        expect(rangedWeapons.length).toBeGreaterThan(50);
        expect(magicWeapons.length).toBeGreaterThan(50);
      });
    });

    describe('item counts', () => {
      test('each style returns a reasonable subset of total items', () => {
        const total = availableEquipment.length;
        const meleeCount = filterByCombatStyle('melee').length;
        const rangedCount = filterByCombatStyle('ranged').length;
        const magicCount = filterByCombatStyle('magic').length;

        // Each style should return less than total (filtering is happening)
        expect(meleeCount).toBeLessThan(total);
        expect(rangedCount).toBeLessThan(total);
        expect(magicCount).toBeLessThan(total);

        // Each style should return a meaningful subset
        expect(meleeCount).toBeGreaterThan(500);
        expect(rangedCount).toBeGreaterThan(300);
        expect(magicCount).toBeGreaterThan(300);
      });
    });
  });

  describe('evaluateItem (opt-001)', () => {
    const abyssalWhip = findEquipment('Abyssal whip');
    const rapier = findEquipment('Ghrazi rapier');
    const bronzeSword = findEquipment('Bronze sword');
    const torvaHelm = findEquipment('Torva full helm');
    const nezzyHelm = findEquipment('Neitiznot faceguard');

    test('returns an ItemEvaluation with dps and score', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const evaluation = evaluateItem(player, monster, rapier);

      expect(evaluation).toHaveProperty('item');
      expect(evaluation).toHaveProperty('dps');
      expect(evaluation).toHaveProperty('score');
      expect(evaluation.item).toBe(rapier);
      expect(typeof evaluation.dps).toBe('number');
      expect(evaluation.dps).toBeGreaterThan(0);
    });

    test('better weapons produce higher DPS', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: bronzeSword },
      });

      const bronzeEval = evaluateItem(player, monster, bronzeSword);
      const whipEval = evaluateItem(player, monster, abyssalWhip);
      const rapierEval = evaluateItem(player, monster, rapier);

      // Rapier > Whip > Bronze sword in terms of DPS
      expect(rapierEval.dps).toBeGreaterThan(whipEval.dps);
      expect(whipEval.dps).toBeGreaterThan(bronzeEval.dps);
    });

    test('evaluates armor pieces correctly', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const torvaEval = evaluateItem(player, monster, torvaHelm);
      const nezzyEval = evaluateItem(player, monster, nezzyHelm);

      // Both should produce valid DPS values
      expect(torvaEval.dps).toBeGreaterThan(0);
      expect(nezzyEval.dps).toBeGreaterThan(0);

      // Torva has higher strength bonus, so should have higher DPS
      expect(torvaEval.dps).toBeGreaterThan(nezzyEval.dps);
    });

    test('score equals dps (default objective)', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const evaluation = evaluateItem(player, monster, rapier);

      expect(evaluation.score).toBe(evaluation.dps);
    });
  });

  describe('evaluateItemDelta', () => {
    const abyssalWhip = findEquipment('Abyssal whip');
    const bronzeSword = findEquipment('Bronze sword');
    const firefCape = findEquipment('Infernal cape');
    const ardiCape = findEquipment('Ardougne cloak 4');

    test('returns positive delta for upgrade (infernal cape vs ardougne cloak)', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip, cape: ardiCape },
      });

      const delta = evaluateItemDelta(player, monster, firefCape);

      // Infernal cape is a clear upgrade over ardougne cloak for melee DPS
      expect(delta).toBeGreaterThan(0);
    });

    test('returns negative delta for downgrade', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const delta = evaluateItemDelta(player, monster, bronzeSword);

      // Bronze sword is a downgrade from abyssal whip
      expect(delta).toBeLessThan(0);
    });

    test('returns zero for same item', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const delta = evaluateItemDelta(player, monster, abyssalWhip);

      // Same item should be essentially zero (might have tiny floating point diff)
      expect(Math.abs(delta)).toBeLessThan(0.0001);
    });

    test('uses provided baseline DPS', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      // Provide a baseline of 5 DPS
      const delta = evaluateItemDelta(player, monster, firefCape, 5);
      const firefCapeDps = evaluateItem(player, monster, firefCape).dps;

      // Delta should be infernal cape DPS minus our provided baseline
      expect(delta).toBeCloseTo(firefCapeDps - 5, 5);
    });
  });

  describe('calculateDps', () => {
    const abyssalWhip = findEquipment('Abyssal whip');

    test('returns a positive DPS value', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const dps = calculateDps(player, monster);

      expect(dps).toBeGreaterThan(0);
      expect(typeof dps).toBe('number');
      expect(Number.isFinite(dps)).toBe(true);
    });

    test('DPS varies by monster', () => {
      const abyssalDemon = getTestMonster('Abyssal demon');
      const corporealBeast = getTestMonster('Corporeal Beast');
      const player = getTestPlayer(abyssalDemon, {
        equipment: { weapon: abyssalWhip },
      });

      const dpsAbyssal = calculateDps(player, abyssalDemon);
      const dpsCorp = calculateDps(player, corporealBeast);

      // Corp beast has much higher defence, so DPS should be lower
      expect(dpsAbyssal).toBeGreaterThan(dpsCorp);
    });
  });

  describe('createPlayerWithEquipment', () => {
    const abyssalWhip = findEquipment('Abyssal whip');
    const rapier = findEquipment('Ghrazi rapier');
    const torvaHelm = findEquipment('Torva full helm');

    test('creates a new player with swapped equipment', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const newPlayer = createPlayerWithEquipment(player, 'weapon', rapier, monster);

      // Original player should be unchanged (check by name since getTestPlayer transforms equipment)
      expect(player.equipment.weapon?.name).toBe('Abyssal whip');

      // New player should have rapier
      expect(newPlayer.equipment.weapon?.name).toBe('Ghrazi rapier');
    });

    test('recalculates bonuses after equipment swap', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const newPlayer = createPlayerWithEquipment(player, 'weapon', rapier, monster);

      // Rapier has higher stab, lower slash than whip
      expect(newPlayer.offensive.stab).toBeGreaterThan(player.offensive.stab);
      expect(newPlayer.offensive.slash).toBeLessThan(player.offensive.slash);
    });

    test('can add equipment to empty slot', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      expect(player.equipment.head).toBeNull();

      const newPlayer = createPlayerWithEquipment(player, 'head', torvaHelm, monster);

      expect(newPlayer.equipment.head?.name).toBe('Torva full helm');
      expect(newPlayer.bonuses.str).toBeGreaterThan(player.bonuses.str);
    });

    test('can clear equipment slot', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const newPlayer = createPlayerWithEquipment(player, 'weapon', null, monster);

      expect(newPlayer.equipment.weapon).toBeNull();
      expect(newPlayer.offensive.slash).toBeLessThan(player.offensive.slash);
    });
  });

  describe('findBestItemForSlot (opt-002)', () => {
    const abyssalWhip = findEquipment('Abyssal whip');
    const rapier = findEquipment('Ghrazi rapier');

    test('returns a SlotOptimizationResult with all required fields', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = findBestItemForSlot('weapon', player, monster);

      expect(result).toHaveProperty('slot');
      expect(result).toHaveProperty('bestItem');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('candidates');
      expect(result.slot).toBe('weapon');
    });

    test('finds the best weapon from all weapons', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = findBestItemForSlot('weapon', player, monster);

      // Should find some weapon (likely a high-tier one)
      expect(result.bestItem).not.toBeNull();
      expect(result.bestItem?.slot).toBe('weapon');
      expect(result.score).toBeGreaterThan(0);
    });

    test('candidates are sorted by score descending', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      // Use a small subset to make the test faster
      const weapons = filterBySlot('weapon').slice(0, 20);
      const result = findBestItemForSlot('weapon', player, monster, weapons);

      // Check that candidates are sorted by score (descending)
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score);
      }
    });

    test('best item matches first candidate', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const weapons = filterBySlot('weapon').slice(0, 20);
      const result = findBestItemForSlot('weapon', player, monster, weapons);

      // Best item should be the first in the sorted candidates list
      expect(result.bestItem).toBe(result.candidates[0].item);
      expect(result.score).toBe(result.candidates[0].score);
    });

    test('returns empty result when no candidates match slot', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      // Pass body armor when looking for weapons - should return empty
      const bodyArmor = filterBySlot('body').slice(0, 5);
      const result = findBestItemForSlot('weapon', player, monster, bodyArmor);

      expect(result.bestItem).toBeNull();
      expect(result.score).toBe(0);
      expect(result.candidates).toHaveLength(0);
    });

    test('returns empty result when candidates array is empty', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = findBestItemForSlot('weapon', player, monster, []);

      expect(result.bestItem).toBeNull();
      expect(result.score).toBe(0);
      expect(result.candidates).toHaveLength(0);
    });

    test('works with pre-filtered candidates', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      // Pre-filter to just melee weapons
      const meleeWeapons = filterByCombatStyle('melee', filterBySlot('weapon'));
      const result = findBestItemForSlot('weapon', player, monster, meleeWeapons);

      expect(result.bestItem).not.toBeNull();
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeLessThanOrEqual(meleeWeapons.length);
    });

    test('finds best head gear for melee', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = findBestItemForSlot('head', player, monster);

      expect(result.bestItem).not.toBeNull();
      expect(result.bestItem?.slot).toBe('head');
      expect(result.score).toBeGreaterThan(0);
    });

    describe('with constraints', () => {
      test('respects blacklist constraint', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        // Get rapier ID for blacklisting
        const rapierId = rapier.id;

        // Find best without blacklist
        const weapons = [abyssalWhip, rapier];
        const resultWithoutBlacklist = findBestItemForSlot('weapon', player, monster, weapons);

        // Find best with rapier blacklisted
        const resultWithBlacklist = findBestItemForSlot('weapon', player, monster, weapons, {
          blacklistedItems: new Set([rapierId]),
        });

        // Rapier is likely better than whip, so with blacklist we should get whip
        expect(resultWithoutBlacklist.candidates.some((c) => c.item.id === rapierId)).toBe(true);
        expect(resultWithBlacklist.candidates.some((c) => c.item.id === rapierId)).toBe(false);
      });

      test('blacklisting all candidates returns empty result', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const weapons = [abyssalWhip, rapier];
        const allIds = new Set([abyssalWhip.id, rapier.id]);

        const result = findBestItemForSlot('weapon', player, monster, weapons, {
          blacklistedItems: allIds,
        });

        expect(result.bestItem).toBeNull();
        expect(result.score).toBe(0);
        expect(result.candidates).toHaveLength(0);
      });

      test('empty blacklist has no effect', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const weapons = [abyssalWhip, rapier];

        const resultNoConstraints = findBestItemForSlot('weapon', player, monster, weapons);
        const resultEmptyBlacklist = findBestItemForSlot('weapon', player, monster, weapons, {
          blacklistedItems: new Set(),
        });

        expect(resultNoConstraints.candidates.length).toBe(resultEmptyBlacklist.candidates.length);
        expect(resultNoConstraints.bestItem?.id).toBe(resultEmptyBlacklist.bestItem?.id);
      });
    });

    describe('performance', () => {
      test('evaluates all candidates in the list', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const weapons = filterBySlot('weapon').slice(0, 50);
        const result = findBestItemForSlot('weapon', player, monster, weapons);

        // All candidates should be evaluated
        expect(result.candidates.length).toBe(50);
      });
    });
  });

  describe('optimizeLoadout (opt-003)', () => {
    const abyssalWhip = findEquipment('Abyssal whip');
    const rapier = findEquipment('Ghrazi rapier');

    test('returns an OptimizerResult with all required fields', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = optimizeLoadout(player, monster);

      // Check required fields exist
      expect(result).toHaveProperty('equipment');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('meta');

      // Check metrics structure
      expect(result.metrics).toHaveProperty('dps');
      expect(result.metrics).toHaveProperty('accuracy');
      expect(result.metrics).toHaveProperty('maxHit');
      expect(typeof result.metrics.dps).toBe('number');
      expect(typeof result.metrics.accuracy).toBe('number');
      expect(typeof result.metrics.maxHit).toBe('number');

      // Check cost structure
      expect(result.cost).toHaveProperty('total');
      expect(result.cost).toHaveProperty('perSlot');

      // Check meta structure
      expect(result.meta).toHaveProperty('evaluations');
      expect(result.meta).toHaveProperty('timeMs');
      expect(result.meta.evaluations).toBeGreaterThan(0);
      expect(result.meta.timeMs).toBeGreaterThanOrEqual(0);
    });

    test('returns a complete PlayerEquipment object', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = optimizeLoadout(player, monster);

      // Should have all 11 slots defined (even if some are null)
      const slots = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'] as const;
      for (const slot of slots) {
        expect(result.equipment).toHaveProperty(slot);
      }
    });

    test('produces positive DPS metrics', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = optimizeLoadout(player, monster);

      expect(result.metrics.dps).toBeGreaterThan(0);
      expect(result.metrics.accuracy).toBeGreaterThan(0);
      expect(result.metrics.accuracy).toBeLessThanOrEqual(1);
      expect(result.metrics.maxHit).toBeGreaterThan(0);
    });

    test('optimizes all 11 slots', () => {
      const monster = getTestMonster('Abyssal demon');
      const player = getTestPlayer(monster, {
        equipment: { weapon: abyssalWhip },
      });

      const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

      // Check that equipment has been selected for major slots
      // Weapon should definitely be filled
      expect(result.equipment.weapon).not.toBeNull();
      expect(result.equipment.weapon?.slot).toBe('weapon');

      // Count how many slots have items
      const filledSlots = Object.values(result.equipment).filter((item) => item !== null).length;
      expect(filledSlots).toBeGreaterThan(5); // At least half the slots should be filled
    });

    describe('with combatStyle option', () => {
      test('filters equipment by combat style', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const meleeResult = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // The selected weapon should be a melee weapon
        expect(meleeResult.equipment.weapon).not.toBeNull();
        const weapon = meleeResult.equipment.weapon!;

        // Check it has melee bonuses (stab, slash, crush attack OR str bonus)
        const hasMeleeBonuses = weapon.offensive.stab > 0
          || weapon.offensive.slash > 0
          || weapon.offensive.crush > 0
          || weapon.bonuses.str > 0;
        expect(hasMeleeBonuses).toBe(true);
      });
    });

    describe('with constraints', () => {
      test('respects blacklist constraint', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const rapierId = rapier.id;

        // Optimize without blacklist
        const resultWithout = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // Optimize with rapier blacklisted
        const resultWith = optimizeLoadout(player, monster, {
          combatStyle: 'melee',
          constraints: { blacklistedItems: new Set([rapierId]) },
        });

        // If rapier was selected without blacklist, it should not be selected with blacklist
        if (resultWithout.equipment.weapon?.id === rapierId) {
          expect(resultWith.equipment.weapon?.id).not.toBe(rapierId);
        }
      });
    });

    describe('metrics calculation', () => {
      test('DPS is recalculated with full optimized loadout', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // The final DPS should be different from initial player DPS
        // since the loadout has been optimized
        const initialDps = calculateDps(player, monster);

        // Optimized DPS should be >= initial (we're optimizing for better performance)
        expect(result.metrics.dps).toBeGreaterThanOrEqual(initialDps);
      });
    });

    describe('meta information', () => {
      test('tracks total number of evaluations', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // Should have evaluated items for all 11 slots
        expect(result.meta.evaluations).toBeGreaterThan(100); // At least some items per slot
      });

      test('tracks optimization time', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, {
          equipment: { weapon: abyssalWhip },
        });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        expect(result.meta.timeMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.meta.timeMs).toBe('number');
      });
    });

    describe('different monsters', () => {
      test('produces different results for different monsters', () => {
        const abyssalDemon = getTestMonster('Abyssal demon');
        const corporealBeast = getTestMonster('Corporeal Beast');

        const player = getTestPlayer(abyssalDemon, {
          equipment: { weapon: abyssalWhip },
        });

        const resultAbyssal = optimizeLoadout(player, abyssalDemon, { combatStyle: 'melee' });
        const resultCorp = optimizeLoadout(player, corporealBeast, { combatStyle: 'melee' });

        // DPS should be different for different monsters
        // Corp beast has much higher defense
        expect(resultAbyssal.metrics.dps).not.toBe(resultCorp.metrics.dps);
      });
    });
  });

  describe('Two-handed weapon handling (opt-004)', () => {
    // Get some common test items
    const abyssalWhip = findEquipment('Abyssal whip'); // 1H melee
    const scythe = findEquipment('Scythe of vitur'); // 2H melee
    const godsword = findEquipment('Armadyl godsword'); // 2H melee
    const dragonDefender = findEquipment('Dragon defender'); // Shield
    const avernicDefender = findEquipment('Avernic defender'); // Shield

    describe('isTwoHandedWeapon', () => {
      test('returns true for two-handed weapons', () => {
        expect(isTwoHandedWeapon(scythe)).toBe(true);
        expect(isTwoHandedWeapon(godsword)).toBe(true);
      });

      test('returns false for one-handed weapons', () => {
        expect(isTwoHandedWeapon(abyssalWhip)).toBe(false);
      });

      test('returns false for null/undefined', () => {
        expect(isTwoHandedWeapon(null)).toBe(false);
        expect(isTwoHandedWeapon(undefined)).toBe(false);
      });

      test('returns false for non-weapon equipment', () => {
        expect(isTwoHandedWeapon(dragonDefender)).toBe(false);
      });
    });

    describe('filterOneHandedWeapons', () => {
      test('filters to only 1H weapons', () => {
        const weapons = filterBySlot('weapon');
        const oneHanded = filterOneHandedWeapons(weapons);

        expect(oneHanded.length).toBeGreaterThan(0);
        expect(oneHanded.every((w) => !w.isTwoHanded)).toBe(true);
      });

      test('includes whip but not godswords', () => {
        const weapons = filterBySlot('weapon');
        const oneHanded = filterOneHandedWeapons(weapons);

        expect(oneHanded).toContain(abyssalWhip);
        expect(oneHanded).not.toContain(godsword);
      });

      test('returns fewer items than total weapons', () => {
        const weapons = filterBySlot('weapon');
        const oneHanded = filterOneHandedWeapons(weapons);

        expect(oneHanded.length).toBeLessThan(weapons.length);
      });
    });

    describe('filterTwoHandedWeapons', () => {
      test('filters to only 2H weapons', () => {
        const weapons = filterBySlot('weapon');
        const twoHanded = filterTwoHandedWeapons(weapons);

        expect(twoHanded.length).toBeGreaterThan(0);
        expect(twoHanded.every((w) => w.isTwoHanded)).toBe(true);
      });

      test('includes godswords but not whip', () => {
        const weapons = filterBySlot('weapon');
        const twoHanded = filterTwoHandedWeapons(weapons);

        expect(twoHanded).toContain(godsword);
        expect(twoHanded).not.toContain(abyssalWhip);
      });
    });

    describe('findBestWeaponShieldCombination', () => {
      test('returns the correct structure', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        const weapons = filterBySlot('weapon').slice(0, 20);
        const shields = filterBySlot('shield').slice(0, 10);

        const result = findBestWeaponShieldCombination(player, monster, weapons, shields);

        expect(result).toHaveProperty('weapon');
        expect(result).toHaveProperty('shield');
        expect(result).toHaveProperty('dps');
        expect(result).toHaveProperty('is2H');
      });

      test('shield is null when 2H weapon is selected', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        // Use only 2H weapons to force 2H selection
        const twoHandedWeapons = [scythe, godsword];
        const shields = [dragonDefender, avernicDefender];

        const result = findBestWeaponShieldCombination(player, monster, twoHandedWeapons, shields);

        expect(result.is2H).toBe(true);
        expect(result.shield).toBeNull();
        expect(result.weapon?.isTwoHanded).toBe(true);
      });

      test('shield can be selected with 1H weapon', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        // Use only 1H weapons
        const oneHandedWeapons = [abyssalWhip];
        const shields = [dragonDefender, avernicDefender];

        const result = findBestWeaponShieldCombination(player, monster, oneHandedWeapons, shields);

        expect(result.is2H).toBe(false);
        expect(result.weapon?.isTwoHanded).toBe(false);
        // Shield should be selected (avernic is better)
        expect(result.shield).not.toBeNull();
      });

      test('compares 2H vs 1H+shield and picks better DPS', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        // Mix of 1H and 2H weapons
        const weapons = [abyssalWhip, godsword];
        const shields = [dragonDefender];

        const result = findBestWeaponShieldCombination(player, monster, weapons, shields);

        // Result should have positive DPS
        expect(result.dps).toBeGreaterThan(0);

        // Either 2H or 1H+shield based on what's better
        if (result.is2H) {
          expect(result.shield).toBeNull();
          expect(result.weapon?.isTwoHanded).toBe(true);
        } else {
          expect(result.weapon?.isTwoHanded).toBe(false);
        }
      });

      test('handles empty weapon list', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        const shields = [dragonDefender];

        const result = findBestWeaponShieldCombination(player, monster, [], shields);

        expect(result.weapon).toBeNull();
        expect(result.shield).toBeNull();
        expect(result.dps).toBe(0);
      });

      test('handles empty shield list with 1H weapon', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        const result = findBestWeaponShieldCombination(player, monster, [abyssalWhip], []);

        // Should still select the 1H weapon, just no shield
        expect(result.weapon).not.toBeNull();
        expect(result.shield).toBeNull();
        expect(result.is2H).toBe(false);
      });

      test('respects blacklist constraint', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        const weapons = [abyssalWhip, godsword];
        const shields = [dragonDefender, avernicDefender];

        // Blacklist the godsword
        const constraints = { blacklistedItems: new Set([godsword.id]) };

        const result = findBestWeaponShieldCombination(player, monster, weapons, shields, constraints);

        // Should not select the blacklisted godsword
        expect(result.weapon?.id).not.toBe(godsword.id);
      });
    });

    describe('optimizeLoadout with 2H weapons', () => {
      test('sets shield to null when 2H weapon is optimal', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        // Optimize for melee
        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // If a 2H weapon was selected, shield should be null
        if (result.equipment.weapon?.isTwoHanded) {
          expect(result.equipment.shield).toBeNull();
        }
      });

      test('can select shield with 1H weapon', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: abyssalWhip } });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // If a 1H weapon was selected, shield could be selected
        if (!result.equipment.weapon?.isTwoHanded) {
          // Shield slot exists (may or may not have a shield depending on optimization)
          expect(result.equipment).toHaveProperty('shield');
        }
      });

      test('2H weapon selection produces valid DPS metrics', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: { weapon: scythe } });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // Should produce valid metrics regardless of 2H/1H choice
        expect(result.metrics.dps).toBeGreaterThan(0);
        expect(result.metrics.accuracy).toBeGreaterThan(0);
        expect(result.metrics.maxHit).toBeGreaterThan(0);
      });

      test('correctly compares 2H vs 1H+shield for best DPS', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: {} });

        const result = optimizeLoadout(player, monster, { combatStyle: 'melee' });

        // The result should be the optimal choice
        // We can't easily verify which is "correct" but we can verify consistency
        if (result.equipment.weapon?.isTwoHanded) {
          // 2H selected - shield must be null
          expect(result.equipment.shield).toBeNull();
        } else if (result.equipment.weapon) {
          // 1H selected - the combination was determined to be better
          // Shield may or may not be present
          expect(result.equipment.weapon.isTwoHanded).toBe(false);
        }
      });

      test('blacklisting 2H weapons forces 1H+shield selection', () => {
        const monster = getTestMonster('Abyssal demon');
        const player = getTestPlayer(monster, { equipment: {} });

        // Get all 2H weapon IDs
        const twoHandedWeaponIds = filterTwoHandedWeapons(filterBySlot('weapon')).map((w) => w.id);
        const blacklist = new Set(twoHandedWeaponIds);

        const result = optimizeLoadout(player, monster, {
          combatStyle: 'melee',
          constraints: { blacklistedItems: blacklist },
        });

        // Should not select any 2H weapon
        if (result.equipment.weapon) {
          expect(result.equipment.weapon.isTwoHanded).toBe(false);
        }
      });
    });
  });
});
