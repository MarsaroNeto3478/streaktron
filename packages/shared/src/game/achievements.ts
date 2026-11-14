// Achievements (plan.md §4.10, D49): medals for steady effort and prizes for milestones (finished
// projects, streak milestones). Pure and derived from the activity log (D8), so medals earned
// before this existed come with the day they were really reached. The server stores each one the
// first time it's earned and never takes it back (like XP, D15).

import { addDays, daysBetween, type DateString } from '../time';
import { byTime, isType, type Activity } from './activity';
import { activeDaysOf, dailyStreak, weeklyStreak } from './streaks';
import { levelFor, xpCredits } from './xp';

export type AchievementKind = 'medal' | 'prize';

export type AchievementGroup =
  | 'tasks'
  | 'focus'
  | 'reviews'
  | 'quests'
  | 'level'
  | 'habits'
  | 'sweeps'
  | 'comeback'
  | 'daily_streak'
  | 'weekly_streak';

export interface AchievementDef {
  key: string;
  kind: AchievementKind;
  group: AchievementGroup;
  title: string;
  description: string;
  /** The value to reach (tasks, hours, days…). */
  target: number;
  /** 1 for the first step of its group, then up. */
  tier: number;
}

interface GroupDef {
  group: AchievementGroup;
  kind: AchievementKind;
  /** What the value counts, for progress ("12 / 100 tasks"). */
  unit: string;
  steps: [target: number, title: string][];
  describe: (target: number) => string;
}

const GROUPS: GroupDef[] = [
  {
    group: 'tasks',
    kind: 'medal',
    unit: 'tasks',
    steps: [
      [1, 'First step'],
      [10, 'Getting things done'],
      [100, 'Hundred done'],
      [500, 'Task machine'],
      [1000, 'A thousand tasks'],
    ],
    describe: (t) => (t === 1 ? 'Complete your first task.' : `Complete ${t} tasks.`),
  },
  {
    group: 'focus',
    kind: 'medal',
    unit: 'hours',
    steps: [
      [1, 'First hour'],
      [10, 'Ten hours in'],
      [50, 'Fifty hours'],
      [100, 'Hundred hours'],
      [500, 'Deep worker'],
    ],
    describe: (t) => (t === 1 ? 'Focus for an hour in all.' : `Focus for ${t} hours in all.`),
  },
  {
    group: 'reviews',
    kind: 'medal',
    unit: 'reviews',
    steps: [
      [1, 'Looking back'],
      [10, 'Ten reviews'],
      [26, 'Half a year of reviews'],
      [52, 'A year of reviews'],
    ],
    describe: (t) =>
      t === 1 ? 'Complete your first weekly review.' : `Complete ${t} weekly reviews.`,
  },
  {
    group: 'quests',
    kind: 'medal',
    unit: 'quests',
    steps: [
      [1, 'Quest taker'],
      [50, 'Adventurer'],
      [200, 'Quest master'],
    ],
    describe: (t) => (t === 1 ? 'Complete your first quest.' : `Complete ${t} quests.`),
  },
  {
    group: 'sweeps',
    kind: 'medal',
    unit: 'days',
    steps: [
      [1, 'Clean sweep'],
      [10, 'Ten clean sweeps'],
    ],
    describe: (t) =>
      t === 1 ? 'Finish every daily quest in a day.' : `Finish every daily quest on ${t} days.`,
  },
  {
    group: 'habits',
    kind: 'medal',
    unit: 'check-ins',
    steps: [
      [30, 'Habit former'],
      [100, 'Hundred check-ins'],
      [365, 'Year of habits'],
    ],
    describe: (t) => `Check in habits ${t} times.`,
  },
  {
    group: 'comeback',
    kind: 'medal',
    unit: 'comebacks',
    steps: [[1, 'Back on track']],
    describe: () => 'Come back after a few days away and finish the comeback quest.',
  },
  {
    group: 'level',
    kind: 'medal',
    unit: 'level',
    steps: [
      [5, 'Level 5'],
      [10, 'Level 10'],
      [20, 'Level 20'],
      [30, 'Level 30'],
    ],
    describe: (t) => `Reach level ${t}.`,
  },
  {
    group: 'daily_streak',
    kind: 'prize',
    unit: 'days',
    steps: [
      [7, 'A week in a row'],
      [30, 'A month in a row'],
      [100, 'Hundred days in a row'],
      [365, 'A year in a row'],
    ],
    describe: (t) => `Keep a ${t}-day streak.`,
  },
  {
    group: 'weekly_streak',
    kind: 'prize',
    unit: 'weeks',
    steps: [
      [4, 'Four steady weeks'],
      [12, 'Steady season'],
      [26, 'Steady half-year'],
      [52, 'Steady year'],
    ],
    describe: (t) => `Meet your weekly target ${t} weeks in a row.`,
  },
];

/** Every medal and milestone prize (finished-project prizes come from the projects themselves). */
export const ACHIEVEMENTS: readonly AchievementDef[] = GROUPS.flatMap((g) =>
  g.steps.map(([target, title], i) => ({
    key: `${g.group}.${target}`,
    kind: g.kind,
    group: g.group,
    title,
    description: g.describe(target),
    target,
    tier: i + 1,
  })),
);

export const ACHIEVEMENT_UNITS: Record<AchievementGroup, string> = Object.fromEntries(
  GROUPS.map((g) => [g.group, g.unit]),
) as Record<AchievementGroup, string>;

/** The key of the prize for finishing a project. */
export const projectPrizeKey = (projectId: string) => `project.${projectId}`;

export interface AchievementInput {
  today: DateString;
  weekStart: number;
  weeklyActiveDayTarget: number;
}

export interface AchievementStatus {
  key: string;
  /** Where the user is now (tasks done, hours focused, longest streak…). */
  value: number;
  /** The day the target was first reached, or null. */
  reachedOn: DateString | null;
}

/** A value that only grows, as (day, value) steps in time order. */
type Series = [DateString, number][];

function firstReached(series: Series, target: number): DateString | null {
  for (const [day, v] of series) if (v >= target) return day;
  return null;
}

/** The first day a value that only grows (in `day`) reaches `target`, by binary search. */
function firstDayAtLeast(
  from: DateString,
  to: DateString,
  value: (day: DateString) => number,
  target: number,
): DateString | null {
  if (value(to) < target) return null;
  let lo = 0;
  let hi = daysBetween(from, to);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (value(addDays(from, mid)) >= target) hi = mid;
    else lo = mid + 1;
  }
  return addDays(from, lo);
}

/** Where every medal and milestone prize stands. */
export function achievementStatus(
  activities: readonly Activity[],
  s: AchievementInput,
): AchievementStatus[] {
  const acts = [...activities].sort(byTime);
  const series: Partial<Record<AchievementGroup, Series>> = {};
  const push = (g: AchievementGroup, day: DateString, v: number) =>
    (series[g] ??= []).push([day, v]);

  const tasks = new Set<string>();
  const reviews = new Set<string>();
  const habits = new Set<string>();
  let focus = 0;
  let quests = 0;
  let sweeps = 0;
  let comebacks = 0;
  let xp = 0;
  const credits = xpCredits(acts);

  for (const a of acts) {
    xp += credits.get(a.id) ?? 0;
    push('level', a.localDate, levelFor(xp));
    if (isType(a, 'task_completed') && !a.payload.subtask && a.entityId) {
      tasks.add(a.entityId);
      push('tasks', a.localDate, tasks.size);
    } else if (isType(a, 'focus_completed')) {
      focus += a.payload.minutes;
      push('focus', a.localDate, Math.floor(focus / 60));
    } else if (isType(a, 'review_completed')) {
      reviews.add(a.payload.weekStart);
      push('reviews', a.localDate, reviews.size);
    } else if (isType(a, 'quest_completed') && !a.payload.replay) {
      push('quests', a.localDate, ++quests);
      if (a.payload.questType === 'comeback') push('comeback', a.localDate, ++comebacks);
    } else if (isType(a, 'quest_bonus')) {
      push('sweeps', a.localDate, ++sweeps);
    } else if (isType(a, 'habit_checked')) {
      habits.add(`${a.entityId}:${a.payload.date}`);
      push('habits', a.localDate, habits.size);
    }
  }

  // Streaks: the longest run so far only grows day by day, so the day a target was reached is
  // found by binary search over the days since the first active one.
  const active = activeDaysOf(acts);
  const first = [...active].sort()[0];
  const daily = (day: DateString) => dailyStreak(active, day).longest;
  const weekly = (day: DateString) =>
    weeklyStreak(active, day, s.weekStart, s.weeklyActiveDayTarget).longest;
  const streakNow = first ? { daily: daily(s.today), weekly: weekly(s.today) } : null;

  return ACHIEVEMENTS.map((d) => {
    if (d.group === 'daily_streak' || d.group === 'weekly_streak') {
      const fn = d.group === 'daily_streak' ? daily : weekly;
      const value = streakNow ? streakNow[d.group === 'daily_streak' ? 'daily' : 'weekly'] : 0;
      const reachedOn =
        first && value >= d.target ? firstDayAtLeast(first, s.today, fn, d.target) : null;
      return { key: d.key, value, reachedOn };
    }
    const sr = series[d.group] ?? [];
    return { key: d.key, value: sr.at(-1)?.[1] ?? 0, reachedOn: firstReached(sr, d.target) };
  });
}
