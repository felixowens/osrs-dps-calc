import { describe, expect, test } from '@jest/globals';
import {
  filterBySlot, filterByCombatStyle, evaluateItem, evaluateItemDelta, calculateDps, createPlayerWithEquipment,
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
});
