import { describe, expect, it } from 'vitest';
import { BOX_TIERS } from '../game/quests';
import { seededRng } from '../game/select';
import {
  CATALOGUE,
  CATEGORIES,
  collectible,
  LOOT_ODDS,
  openBox,
  pityFloor,
  RARITIES,
  rollRarity,
  type Rarity,
} from '.';

const rank = (r: Rarity) => RARITIES.indexOf(r);

describe('the catalogue (D48)', () => {
  it('has unique keys, every category and every rarity', () => {
    expect(new Set(CATALOGUE.map((c) => c.key)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((c) => c.sprite)).size).toBe(CATALOGUE.length);
    for (const cat of CATEGORIES) expect(CATALOGUE.some((c) => c.category === cat)).toBe(true);
    for (const r of RARITIES) expect(CATALOGUE.some((c) => c.rarity === r)).toBe(true);
    expect(collectible('bear')?.rarity).toBe('legendary');
    expect(collectible('nope')).toBeUndefined();
  });

  it('gets rarer as it goes up', () => {
    const count = (r: Rarity) => CATALOGUE.filter((c) => c.rarity === r).length;
    for (let i = 1; i < RARITIES.length; i++) {
      expect(count(RARITIES[i]!)).toBeLessThanOrEqual(count(RARITIES[i - 1]!));
    }
  });
});

describe('loot odds and pity (plan.md §4.9)', () => {
  it('has odds that add up, better for bigger boxes', () => {
    for (const t of BOX_TIERS) expect(LOOT_ODDS[t].reduce((a, b) => a + b, 0)).toBe(1000);
    const rareOrBetter = (t: (typeof BOX_TIERS)[number]) =>
      LOOT_ODDS[t].slice(2).reduce((a, b) => a + b, 0);
    expect(rareOrBetter('small')).toBeLessThan(rareOrBetter('standard'));
    expect(rareOrBetter('standard')).toBeLessThan(rareOrBetter('large'));
    expect(rareOrBetter('large')).toBeLessThan(rareOrBetter('special'));
  });

  it('raises the floor after 9 boxes without a Rare, and 29 without an Epic', () => {
    const commons = (n: number): Rarity[] => Array.from({ length: n }, () => 'common');
    expect(pityFloor([])).toBe('common');
    expect(pityFloor(commons(8))).toBe('common');
    expect(pityFloor(commons(9))).toBe('rare');
    expect(pityFloor([...commons(8), 'rare'])).toBe('common');
    expect(pityFloor([...commons(20), 'epic', ...commons(8)])).toBe('common');
    expect(pityFloor([...commons(20), 'epic', ...commons(9)])).toBe('rare');
    expect(pityFloor([...commons(19), 'rare', ...commons(9)])).toBe('epic');
    expect(pityFloor([...commons(28), 'legendary'])).toBe('common');
  });

  it('never rolls below the floor', () => {
    const rng = seededRng(5);
    const commons: Rarity[] = Array.from({ length: 29 }, () => 'common');
    for (let i = 0; i < 200; i++) {
      expect(rank(rollRarity('small', commons, rng))).toBeGreaterThanOrEqual(rank('epic'));
      expect(rank(rollRarity('small', commons.slice(0, 9), rng))).toBeGreaterThanOrEqual(
        rank('rare'),
      );
    }
  });

  it('keeps the distribution and the pity rules over many openings', () => {
    for (const seed of [1, 2, 3]) {
      const rng = seededRng(seed);
      const history: Rarity[] = [];
      for (let i = 0; i < 5000; i++) history.push(openBox('standard', history, rng).rarity);
      // Pity: every 10 in a row has a Rare or better, every 30 an Epic or better.
      for (let i = 0; i + 10 <= history.length; i++) {
        expect(history.slice(i, i + 10).some((r) => rank(r) >= rank('rare'))).toBe(true);
      }
      for (let i = 0; i + 30 <= history.length; i++) {
        expect(history.slice(i, i + 30).some((r) => rank(r) >= rank('epic'))).toBe(true);
      }
      // Close to the base odds (pity only adds a little to the rarer end).
      const share = (r: Rarity) => history.filter((h) => h === r).length / history.length;
      expect(share('common')).toBeGreaterThan(0.5);
      expect(share('common')).toBeLessThan(0.63);
      expect(share('uncommon')).toBeGreaterThan(0.2);
      expect(share('uncommon')).toBeLessThan(0.3);
      expect(share('rare')).toBeGreaterThan(0.08);
      expect(share('legendary')).toBeGreaterThan(0.002);
      expect(share('legendary')).toBeLessThan(0.025);
    }
  });

  it('gives an item of the rolled rarity', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 100; i++) {
      const { rarity, item } = openBox('large', [], rng);
      expect(item.rarity).toBe(rarity);
    }
  });
});
