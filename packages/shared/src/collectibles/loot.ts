// Loot boxes (plan.md §4.9, D11, D48): which rarity a box rolls and which item comes out. Pure, so the
// odds and the pity rules are tested with seeded randomness; the server rolls with crypto randomness
// when a box is opened and stores the result (recompute never rerolls).

import type { BoxTier } from '../game/quests';
import { CATALOGUE, RARITIES, type Collectible, type Rarity } from './catalogue';

type Rng = () => number;

/** Odds per tier, in thousandths, in RARITIES order (common → legendary). Each row sums to 1000. */
export const LOOT_ODDS: Record<BoxTier, readonly number[]> = {
  small: [700, 220, 60, 17, 3],
  standard: [600, 250, 100, 40, 10],
  large: [450, 300, 150, 75, 25],
  special: [300, 300, 220, 130, 50],
};

/** Pity: a box is at least this rarity when the boxes before it went this long without one. */
export const PITY = [
  { atLeast: 'epic', within: 30 },
  { atLeast: 'rare', within: 10 },
] as const satisfies readonly { atLeast: Rarity; within: number }[];

const rank = (r: Rarity) => RARITIES.indexOf(r);

/**
 * The lowest rarity the next box must have, from the rarities of the boxes opened so far (oldest
 * first): Rare or better when none of the last 9 was, Epic or better when none of the last 29 was.
 */
export function pityFloor(history: readonly Rarity[]): Rarity {
  for (const p of PITY) {
    const recent = history.slice(-(p.within - 1));
    if (recent.length === p.within - 1 && recent.every((r) => rank(r) < rank(p.atLeast))) {
      return p.atLeast;
    }
  }
  return 'common';
}

/** Roll a rarity: the tier's odds, with everything below the pity floor taken out. */
export function rollRarity(tier: BoxTier, history: readonly Rarity[], rng: Rng): Rarity {
  const floor = rank(pityFloor(history));
  const weights = LOOT_ODDS[tier].map((w, i) => (i < floor ? 0 : w));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return RARITIES[i]!;
  }
  return RARITIES[weights.length - 1]!;
}

/** Any item of a rarity, each equally likely. */
export function rollItem(rarity: Rarity, rng: Rng, catalogue = CATALOGUE): Collectible {
  const pool = catalogue.filter((c) => c.rarity === rarity);
  if (!pool.length) throw new Error(`No collectible of rarity ${rarity}`);
  return pool[Math.floor(rng() * pool.length)]!;
}

/** Open a box: its rarity, then an item of that rarity. */
export function openBox(tier: BoxTier, history: readonly Rarity[], rng: Rng) {
  const rarity = rollRarity(tier, history, rng);
  return { rarity, item: rollItem(rarity, rng) };
}
