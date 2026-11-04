// Picking and sizing quests (patterns proven in Quire, plan.md §11): weighted picks that grow with
// waiting time, time targets sized from your own recent days, and the make-quest soft cap (D16).

import { GAME } from './config';

/** A random number in [0, 1); the server passes a real one, tests a seeded one. */
export type Rng = () => number;

/** A small seeded RNG (mulberry32), for tests and reproducible simulations. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A candidate's weight: its need, growing with the days since it was last offered or worked on,
 * so nothing is left out forever.
 */
export function questWeight(need: number, daysWaiting: number): number {
  const d = Math.min(Math.max(0, daysWaiting), GAME.quests.maxWaitingDays);
  return Math.max(0, need) * (1 + d / 7) ** 2;
}

/** Up to `n` distinct items, each picked with probability proportional to its weight. */
export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
  n: number,
  rng: Rng,
): T[] {
  const pool = items.map((item) => ({ item, w: Math.max(0, weight(item)) })).filter((x) => x.w > 0);
  const picked: T[] = [];
  while (picked.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let i = 0;
    while (i < pool.length - 1 && r >= pool[i]!.w) r -= pool[i++]!.w;
    picked.push(pool[i]!.item);
    pool.splice(i, 1);
  }
  return picked;
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const roundTo = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const spread = (rng: Rng) => {
  const [lo, hi] = GAME.quests.sizing.spread;
  return lo + rng() * (hi - lo);
};

/**
 * Minutes for "focus N min today": the median of your recent days with focus × 0.8–1.2, rounded to
 * 5 and clamped to your settings. `focusDays` holds the minutes of each recent day that had focus.
 */
export function sizeDayMinutes(
  focusDays: readonly number[],
  limits: { min: number; max: number },
  rng: Rng,
): number {
  const { minHistoryDays, defaultDayMinutes } = GAME.quests.sizing;
  const base =
    focusDays.length >= minHistoryDays
      ? median(focusDays) * spread(rng)
      : defaultDayMinutes[0] + rng() * (defaultDayMinutes[1] - defaultDayMinutes[0]);
  const lo = Math.min(limits.min, limits.max);
  return clamp(roundTo(base, 5), lo, Math.max(lo, limits.max));
}

/** Minutes for "focus N h this week": a usual focus day × your weekly active-day target. */
export function sizeWeekMinutes(
  focusDays: readonly number[],
  weeklyTarget: number,
  rng: Rng,
): number {
  const { minHistoryDays, defaultWeekMinutes, weekMinutes } = GAME.quests.sizing;
  const base =
    focusDays.length >= minHistoryDays
      ? median(focusDays) * weeklyTarget * spread(rng)
      : defaultWeekMinutes[0] + rng() * (defaultWeekMinutes[1] - defaultWeekMinutes[0]);
  return clamp(roundTo(base, 15), weekMinutes[0], weekMinutes[1]);
}

/** XP for a time quest, growing with its target. */
export function timeQuestXp(minutes: number, period: 'day' | 'week'): number {
  return period === 'day'
    ? clamp(roundTo(20 + minutes / 3, 5), 30, 80)
    : clamp(roundTo(40 + minutes / 15, 5), 60, 100);
}

/**
 * The make-quest soft cap (D16): `1 / (1 + (open / cap)²) × 1 / (1 + 2 · undetailed)`, or 0 above
 * the hard ceiling. `open`: open items of that kind in the project; `undetailed`: pending
 * follow-ups (items still missing details).
 */
export function makeFactor(open: number, cap: number, undetailed: number): number {
  const { maxPendingFollowUps, ceilingFactor } = GAME.quests.make;
  if (undetailed >= maxPendingFollowUps || open >= ceilingFactor * cap) return 0;
  return (1 / (1 + (open / cap) ** 2)) * (1 / (1 + 2 * undetailed));
}
