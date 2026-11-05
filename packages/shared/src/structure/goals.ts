// Commitment goals (Phase 4, D40): progress from focus minutes on the goal's project in the current
// week or month, and the pace needed to hit the target ("25 min a day to go"). Pure, like the game
// rules: the server computes it from the activity log and sends it with the goal.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';
import type { GoalPeriod } from './index';

/** A period of a commitment goal: `start` inclusive, `end` exclusive. */
export interface GoalPeriodRange {
  start: DateString;
  end: DateString;
}

/** The week (the user's week) or calendar month `day` is in. */
export function goalPeriodOf(
  day: DateString,
  period: GoalPeriod,
  weekStart: number,
): GoalPeriodRange {
  if (period === 'week') {
    const start = startOfWeek(day, weekStart);
    return { start, end: addDays(start, 7) };
  }
  const [y, m] = day.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start: `${day.slice(0, 7)}-01`, end: next };
}

/** How many past periods the streak looks back on, at most. */
export const GOAL_LOOKBACK = { week: 52, month: 24 } as const;

/** The days whose focus a commitment goal's progress needs: from the oldest period it looks at. */
export function goalMinutesFrom(
  today: DateString,
  period: GoalPeriod,
  weekStart: number,
  createdOn: DateString,
): DateString {
  let p = goalPeriodOf(today, period, weekStart);
  for (let i = 0; i < GOAL_LOOKBACK[period] && p.start > createdOn; i++) {
    p = goalPeriodOf(addDays(p.start, -1), period, weekStart);
  }
  return p.start;
}

export type GoalPace = 'done' | 'on_track' | 'behind' | 'ended';

export interface CommitmentProgress {
  /** The current period (clipped to the goal's end date). */
  start: DateString;
  end: DateString;
  minutes: number;
  target: number;
  /** Days left in the period, today included. */
  daysLeft: number;
  /** Minutes a day still needed to hit the target (0 when done or ended). */
  perDay: number;
  /** Minutes an even pace would have reached by the start of today. */
  expected: number;
  pace: GoalPace;
  /** Periods in a row with the target met: the finished ones before this, plus this one if met. */
  streak: number;
  /** The last finished periods since the goal was created, oldest first (at most four). */
  history: { start: DateString; minutes: number; met: boolean }[];
}

export interface CommitmentInput {
  today: DateString;
  period: GoalPeriod;
  weekStart: number;
  target: number;
  /** The goal's optional end date ("Until"), inclusive. */
  until: DateString | null;
  /** The day the goal was created: periods that ended before it don't count. */
  createdOn: DateString;
  /** Focus minutes on the project per day. */
  minutesByDay: ReadonlyMap<DateString, number>;
}

function sumMinutes(m: ReadonlyMap<DateString, number>, from: DateString, to: DateString) {
  let total = 0;
  for (const [day, n] of m) if (day >= from && day < to) total += n;
  return total;
}

export function commitmentProgress(i: CommitmentInput): CommitmentProgress {
  const ended = i.until !== null && i.until < i.today;
  // Once the goal is over, its last period stays on show.
  const period = goalPeriodOf(ended ? i.until! : i.today, i.period, i.weekStart);
  // The goal's last day cuts its period short.
  const end = i.until !== null && i.until < period.end ? addDays(i.until, 1) : period.end;
  const minutes = sumMinutes(i.minutesByDay, period.start, end);
  const total = daysBetween(period.start, end);
  const elapsed = ended ? total : daysBetween(period.start, i.today);
  const daysLeft = ended ? 0 : daysBetween(i.today, end);
  const expected = Math.round((i.target * elapsed) / total);
  const remaining = Math.max(0, i.target - minutes);
  const done = remaining === 0;

  const history: CommitmentProgress['history'] = [];
  let streak = 0;
  let counting = true;
  let p = goalPeriodOf(addDays(period.start, -1), i.period, i.weekStart);
  for (let n = 0; n < GOAL_LOOKBACK[i.period] && p.end > i.createdOn; n++) {
    const m = sumMinutes(i.minutesByDay, p.start, p.end);
    const met = m >= i.target;
    if (history.length < 4) history.unshift({ start: p.start, minutes: m, met });
    if (counting && met) streak++;
    else counting = false;
    p = goalPeriodOf(addDays(p.start, -1), i.period, i.weekStart);
  }
  if (done) streak++;

  return {
    start: period.start,
    end,
    minutes,
    target: i.target,
    daysLeft,
    perDay: done || ended ? 0 : Math.ceil(remaining / daysLeft),
    expected,
    pace: done ? 'done' : ended ? 'ended' : minutes >= expected ? 'on_track' : 'behind',
    streak,
    history,
  };
}
