// Habits (Phase 4): schedules, what's due on a day, and each habit's own streak. Pure functions
// over check-in dates; the server stores the dates, these decide what they mean.
//
// Two kinds of schedule:
// - `weekdays`: due on the listed weekdays (all seven = every day). The streak counts scheduled
//   days in a row that were checked in.
// - `per_week`: N times a week, any days. Due on a day while the week's count isn't reached. The
//   streak counts weeks in a row that reached it.
// Like the daily streak, the current day (or week) only adds: until it's over it can't break
// anything.

import { addDays, startOfWeek, weekdayOf, type DateString } from '../time';

export type HabitSchedule =
  | { type: 'weekdays'; /** 0 = Sunday … 6 = Saturday */ days: number[] }
  | { type: 'per_week'; count: number };

export const EVERY_DAY: HabitSchedule = { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every day", "Weekdays", "Mon, Wed, Fri", "3× a week". */
export function scheduleLabel(s: HabitSchedule, weekStart = 1): string {
  if (s.type === 'per_week') return s.count === 7 ? 'Every day' : `${s.count}× a week`;
  const days = [...new Set(s.days)];
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  const ordered = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7).filter((d) => set.has(d));
  return ordered.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** Whether the schedule names `day` (weekdays) — per-week habits fit any day. */
export function scheduledOn(s: HabitSchedule, day: DateString): boolean {
  return s.type === 'per_week' || s.days.includes(weekdayOf(day));
}

/** Check-ins in the week of `day`. */
export function weekCount(
  checkins: ReadonlySet<DateString>,
  day: DateString,
  weekStart: number,
): number {
  const start = startOfWeek(day, weekStart);
  let n = 0;
  for (let i = 0; i < 7; i++) if (checkins.has(addDays(start, i))) n++;
  return n;
}

/**
 * Whether the habit belongs on `day`'s list: scheduled that day, or (per week) the week's count
 * isn't reached yet. A habit already checked in that day stays on the list (shown as done).
 */
export function dueOn(
  s: HabitSchedule,
  day: DateString,
  checkins: ReadonlySet<DateString>,
  weekStart: number,
): boolean {
  if (checkins.has(day)) return true;
  if (s.type === 'weekdays') return s.days.includes(weekdayOf(day));
  return weekCount(checkins, day, weekStart) < s.count;
}

export interface HabitStreak {
  current: number;
  longest: number;
  unit: 'day' | 'week';
}

/**
 * The habit's streak as of `today`, from the day it started (its creation day): scheduled days
 * (or weeks) in a row that were done. Today (this week) only adds.
 */
export function habitStreak(
  s: HabitSchedule,
  checkins: ReadonlySet<DateString>,
  today: DateString,
  weekStart: number,
  since: DateString,
): HabitStreak {
  let current = 0;
  let longest = 0;

  if (s.type === 'weekdays') {
    const days = new Set(s.days);
    if (days.size === 0) return { current: 0, longest: 0, unit: 'day' };
    // Any check-in before the start counts too (e.g. one backdated to the day before).
    const first = [...checkins].sort()[0];
    const start = first !== undefined && first < since ? first : since;
    for (let day = start; day <= today; day = addDays(day, 1)) {
      if (!days.has(weekdayOf(day))) continue;
      if (checkins.has(day)) current++;
      else if (day < today) current = 0;
      longest = Math.max(longest, current);
    }
    return { current, longest, unit: 'day' };
  }

  const thisWeek = startOfWeek(today, weekStart);
  for (let week = startOfWeek(since, weekStart); week <= thisWeek; week = addDays(week, 7)) {
    const met = weekCount(checkins, week, weekStart) >= s.count;
    if (met) current++;
    else if (week < thisWeek) current = 0;
    longest = Math.max(longest, current);
  }
  return { current, longest, unit: 'week' };
}

/** The last `n` days ending at `today`, oldest first, with whether each was checked/scheduled. */
export function recentDays(
  s: HabitSchedule,
  checkins: ReadonlySet<DateString>,
  today: DateString,
  n = 7,
): { day: DateString; checked: boolean; scheduled: boolean }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, checked: checkins.has(day), scheduled: scheduledOn(s, day) });
  }
  return out;
}

/** How far back a check-in may be made: today, or yesterday when it was forgotten (D34). */
export const CHECKIN_BACKDATE_DAYS = 1;
