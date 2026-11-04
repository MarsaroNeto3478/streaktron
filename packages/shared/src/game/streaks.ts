// Active days and streaks. Forgiving by design: a missed day uses a banked freeze, the weekly
// streak only asks for a few active days a week, and today never breaks anything while it lasts.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';
import type { Activity } from './activity';
import { GAME } from './config';

/** Whether an activity makes its day an active day. */
export function qualifies(a: Activity): boolean {
  switch (a.type) {
    case 'task_completed':
      return true;
    case 'focus_completed':
      return a.payload.minutes >= GAME.xp.focusMinMinutes;
    default:
      return false;
  }
}

/** The days with at least one qualifying activity. */
export function activeDaysOf(activities: readonly Activity[]): Set<DateString> {
  const days = new Set<DateString>();
  for (const a of activities) if (qualifies(a)) days.add(a.localDate);
  return days;
}

export interface DailyStreak {
  /** Active days in the current run (frozen days keep it alive but don't add to it). */
  current: number;
  longest: number;
  /** Banked freezes. */
  freezes: number;
  /** Days a freeze covered, oldest first. */
  frozenDays: DateString[];
  activeToday: boolean;
  /** The run is alive, today isn't active yet and no freeze is left to cover it. */
  atRisk: boolean;
}

/**
 * The daily streak as of `today`. Days before today are settled: active, covered by a freeze, or
 * the end of the run. Today only adds; until it ends it can't break anything.
 */
export function dailyStreak(active: ReadonlySet<DateString>, today: DateString): DailyStreak {
  const { freezeEvery, maxFreezes } = GAME.streaks;
  let current = 0;
  let longest = 0;
  let freezes = 0;
  let run = 0; // consecutive active days, for earning freezes
  let frozenDays: DateString[] = [];

  const first = [...active].sort()[0];
  if (first !== undefined && first < today) {
    for (let day = first; day < today; day = addDays(day, 1)) {
      if (active.has(day)) {
        current++;
        run++;
        if (run % freezeEvery === 0 && freezes < maxFreezes) freezes++;
      } else if (current > 0 && freezes > 0) {
        freezes--;
        run = 0;
        frozenDays.push(day);
      } else {
        current = 0;
        run = 0;
        frozenDays = [];
      }
      longest = Math.max(longest, current);
    }
  }

  const activeToday = active.has(today);
  if (activeToday) {
    current++;
    run++;
    if (run % freezeEvery === 0 && freezes < maxFreezes) freezes++;
    longest = Math.max(longest, current);
  }
  return {
    current,
    longest,
    freezes,
    frozenDays,
    activeToday,
    atRisk: current > 0 && !activeToday && freezes === 0,
  };
}

export interface WeeklyStreak {
  /** Weeks in a row meeting the target, this week included once it's met. */
  current: number;
  longest: number;
  week: { start: DateString; activeDays: number; target: number; met: boolean };
}

/** Consecutive weeks with at least `target` active days. The current week can only add. */
export function weeklyStreak(
  active: ReadonlySet<DateString>,
  today: DateString,
  weekStart: number,
  target: number,
): WeeklyStreak {
  const thisWeek = startOfWeek(today, weekStart);
  const counts = new Map<DateString, number>();
  for (const day of active) {
    if (day > today) continue;
    const w = startOfWeek(day, weekStart);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  let current = 0;
  let longest = 0;
  const first = [...counts.keys()].sort()[0];
  if (first !== undefined) {
    for (let w = first; w < thisWeek; w = addDays(w, 7)) {
      current = (counts.get(w) ?? 0) >= target ? current + 1 : 0;
      longest = Math.max(longest, current);
    }
  }
  const activeDays = counts.get(thisWeek) ?? 0;
  const met = activeDays >= target;
  if (met) {
    current++;
    longest = Math.max(longest, current);
  }
  return { current, longest, week: { start: thisWeek, activeDays, target, met } };
}

/** Whole days since the last active day before `today` (null when there's none). */
export function daysSinceActive(active: ReadonlySet<DateString>, today: DateString): number | null {
  let last: DateString | null = null;
  for (const day of active) if (day < today && (last === null || day > last)) last = day;
  return last === null ? null : daysBetween(last, today);
}
