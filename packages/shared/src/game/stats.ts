// The stats page (plan.md Phase 6, D50): where the time went, from the activity log. Pure, so the
// numbers are tested; the server adds names (projects, areas) and quest outcomes.

import { addDays, startOfWeek, type DateString } from '../time';
import { byTime, isType, type Activity } from './activity';
import { activeDaysOf, dailyStreak, qualifies } from './streaks';
import { xpCredits } from './xp';

export interface WeekStats {
  /** The week's first day. */
  start: DateString;
  focusMinutes: number;
  tasks: number;
  xp: number;
  activeDays: number;
}

export type Totals = Omit<WeekStats, 'start'>;

export interface StreakRun {
  start: DateString;
  /** The last active day of the run. */
  end: DateString;
  /** Active days in it (days a freeze covered keep it alive but don't add). */
  days: number;
  /** Still going today. */
  current: boolean;
}

export interface StatsOverview {
  from: DateString;
  to: DateString;
  weeks: WeekStats[];
  totals: Totals;
  /** The same number of weeks just before, for "vs. before". */
  previous: Totals;
  /** Focus minutes per project id (`null`: no project). */
  focusByProject: { projectId: string | null; minutes: number }[];
  /** Every daily streak run of 2 days or more, longest first. */
  streaks: StreakRun[];
}

const empty = (): Totals => ({ focusMinutes: 0, tasks: 0, xp: 0, activeDays: 0 });

/** The daily streak's runs, oldest first (same rules as the streak itself, freezes included). */
export function streakRuns(active: ReadonlySet<DateString>, today: DateString): StreakRun[] {
  const runs: StreakRun[] = [];
  // The run being walked (an object: the callback writes it).
  const run = { start: null as DateString | null, last: null as DateString | null, days: 0 };
  const s = dailyStreak(active, today, (day, kind, current) => {
    if (kind === 'active') {
      if (current === 1) run.start = day;
      run.last = day;
      run.days = current;
    } else if (kind === 'missed' && run.start && run.last) {
      runs.push({ start: run.start, end: run.last, days: run.days, current: false });
      run.start = null;
      run.days = 0;
    }
  });
  if (run.start && run.last && s.current > 0) {
    runs.push({ start: run.start, end: run.last, days: run.days, current: true });
  }
  return runs;
}

/** Weekly totals for the last `weeks` weeks (this one included), and what goes with them. */
export function statsOverview(
  activities: readonly Activity[],
  o: { today: DateString; weekStart: number; weeks: number },
): StatsOverview {
  const thisWeek = startOfWeek(o.today, o.weekStart);
  const from = addDays(thisWeek, -7 * (o.weeks - 1));
  const prevFrom = addDays(from, -7 * o.weeks);
  // Credits need the whole log (earn-once, daily caps).
  const credits = xpCredits(activities);

  const weeks = new Map<DateString, WeekStats>();
  for (let i = 0; i < o.weeks; i++) {
    const start = addDays(from, 7 * i);
    weeks.set(start, { start, ...empty() });
  }
  const totals = empty();
  const previous = empty();
  const focus = new Map<string | null, number>();
  const activeIn = { now: new Set<DateString>(), before: new Set<DateString>() };

  // A task counts once, on its first completion (reopened and done again: still one, like XP).
  const seenTasks = new Set<string>();
  for (const a of [...activities].sort(byTime)) {
    const firstDone = isType(a, 'task_completed') && !!a.entityId && !seenTasks.has(a.entityId);
    if (firstDone) seenTasks.add(a.entityId!);
    if (a.localDate > o.today || a.localDate < prevFrom) continue;
    const now = a.localDate >= from;
    const t = now ? totals : previous;
    const w = now ? weeks.get(startOfWeek(a.localDate, o.weekStart)) : undefined;
    const xp = credits.get(a.id) ?? 0;
    t.xp += xp;
    if (w) w.xp += xp;
    if (isType(a, 'focus_completed')) {
      t.focusMinutes += a.payload.minutes;
      if (w) w.focusMinutes += a.payload.minutes;
      if (now)
        focus.set(a.payload.projectId, (focus.get(a.payload.projectId) ?? 0) + a.payload.minutes);
    } else if (isType(a, 'task_completed') && !a.payload.subtask && firstDone) {
      t.tasks++;
      if (w) w.tasks++;
    }
    if (qualifies(a)) {
      const set = now ? activeIn.now : activeIn.before;
      if (!set.has(a.localDate)) {
        set.add(a.localDate);
        t.activeDays++;
        if (w) w.activeDays++;
      }
    }
  }

  return {
    from,
    to: o.today,
    weeks: [...weeks.values()],
    totals,
    previous,
    focusByProject: [...focus]
      .map(([projectId, minutes]) => ({ projectId, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    streaks: streakRuns(activeDaysOf(activities), o.today)
      .filter((r) => r.days >= 2)
      .sort((a, b) => b.days - a.days || b.end.localeCompare(a.end)),
  };
}
