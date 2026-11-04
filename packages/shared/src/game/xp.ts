// XP and levels. XP is never taken away and each source earns once (D15): a task's completion
// earns the first time only; reopening keeps it, completing it again earns 0, deleting it changes
// nothing (the log is append-only).

import { byTime, type Activity } from './activity';
import { GAME } from './config';

/** Which source an activity earns for; a second activity of the same source earns 0. */
function sourceKey(a: Activity): string | null {
  switch (a.type) {
    case 'task_completed':
    case 'focus_completed':
    case 'quest_completed':
    case 'quest_bonus':
      return a.entityId ? `${a.type}:${a.entityId}` : null;
    default:
      return null;
  }
}

/** XP before the daily soft cap and earn-once. */
function baseXp(a: Activity): number {
  switch (a.type) {
    case 'task_completed':
      return a.payload.subtask ? GAME.xp.subtask : GAME.xp.task[a.payload.effort ?? 'S'];
    case 'focus_completed':
      return a.payload.minutes >= GAME.xp.focusMinMinutes
        ? Math.floor(a.payload.minutes) * GAME.xp.focusPerMinute
        : 0;
    case 'quest_completed':
    case 'quest_bonus':
      return Math.max(0, Math.floor(a.payload.xp));
    default:
      return 0;
  }
}

/**
 * What each activity earned, by id. Replaying the whole log always gives the same answer, so
 * recompute reproduces it exactly.
 */
export function xpCredits(activities: readonly Activity[]): Map<string, number> {
  const credits = new Map<string, number>();
  const earned = new Set<string>();
  const taskXpByDay = new Map<string, number>();
  const cap = GAME.xp.taskDailySoftCap;

  for (const a of [...activities].sort(byTime)) {
    const key = sourceKey(a);
    let xp = baseXp(a);
    if (key) {
      if (earned.has(key)) xp = 0;
      else if (xp > 0) earned.add(key);
    }
    if (a.type === 'task_completed' && xp > 0) {
      // Halve whatever goes past the day's soft cap.
      const before = taskXpByDay.get(a.localDate) ?? 0;
      const full = Math.max(0, Math.min(xp, cap - before));
      taskXpByDay.set(a.localDate, before + xp);
      xp = full + Math.floor((xp - full) / 2);
    }
    credits.set(a.id, xp);
  }
  return credits;
}

export const totalXp = (credits: Map<string, number>) => {
  let sum = 0;
  for (const xp of credits.values()) sum += xp;
  return sum;
};

/** Cumulative XP needed to reach `level` (level 1 needs 0). */
export const xpForLevel = (level: number) => GAME.levels.step * level * (level - 1);

/** The level `xp` reaches. */
export function levelFor(xp: number): number {
  let n = Math.max(
    1,
    Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / GAME.levels.step)) / 2),
  );
  // Float rounding can land one off either way at exact thresholds.
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 1 && xpForLevel(n) > xp) n--;
  return n;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside this level. */
  into: number;
  /** XP this level spans (to the next one). */
  span: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  const floor = xpForLevel(level);
  return { level, into: xp - floor, span: xpForLevel(level + 1) - floor };
}
