// Every number the game runs on, in one place (plan.md §5). Initial values: tune them after
// dogfooding, here and nowhere else.

import type { Effort } from '../structure';

export const GAME = {
  xp: {
    /** A completed top-level task, by effort. A task with no effort set counts as S. */
    task: { S: 10, M: 25, L: 50 } satisfies Record<Effort, number>,
    /** Subtasks earn nothing; their parent carries the XP. */
    subtask: 0,
    /** Task XP a day above this is halved (guards against bulk-closing). */
    taskDailySoftCap: 200,
    /** Focus sessions earn 1 XP a minute from this length on. */
    focusMinMinutes: 10,
    focusPerMinute: 1,
    /** A habit check-in, once per habit and day… */
    habitCheckin: 10,
    /** …but none on the day the habit was made, and at most this much a day from habits (D37). */
    habitDailyCap: 50,
    /** The weekly review, once per week (D38). */
    weeklyReview: 50,
  },
  review: {
    /** Today reminds about the review on the week's last this-many days (and the next one's first). */
    windowDays: 2,
    /** The "Do the weekly review" quest. */
    questXp: 50,
    /** "Revisit a parked project" (D43): its XP, and how long a project stays parked before it. */
    parkedXp: 50,
    parkedAfterDays: 7,
  },
  levels: {
    /** Cumulative XP to reach level n is `step · n · (n − 1)`: L2 = 100, L3 = 300, L10 = 4500. */
    step: 50,
  },
  streaks: {
    /** One freeze per this many consecutive active days… */
    freezeEvery: 7,
    /** …banked up to this many. */
    maxFreezes: 2,
  },
  quests: {
    quickPerDay: 3,
    dailyPerDay: 3,
    makePerDay: 1,
    /** Bonus XP for finishing every daily quest of a day. */
    boardBonusXp: 25,
    /** Inactive days (before today) that bring the comeback quest. */
    comebackAfterDays: 2,
    /** With no active day for this long, only the comeback quest is offered. */
    idleAfterDays: 7,
    /** Days a project needs without work to count as "untouched". */
    staleProjectDays: 3,
    /** Waiting time is counted up to this many days. */
    maxWaitingDays: 28,
    /** Sizing from your own days. */
    sizing: {
      historyDays: 28,
      minHistoryDays: 3,
      spread: [0.8, 1.2] as const,
      defaultDayMinutes: [30, 60] as const,
      defaultWeekMinutes: [120, 240] as const,
      weekMinutes: [60, 1800] as const,
    },
    make: {
      /** Open items in a project at which a make quest's weight has halved. */
      cap: { task: 15, goal: 3 },
      /** No make quest at all with this many follow-ups pending… */
      maxPendingFollowUps: 3,
      /** …or with this many times `cap` open items. */
      ceilingFactor: 2,
      /** Follow-ups ask for this many of the item's missing details. */
      followUpParts: 2,
      /** A "break it down" quest needs this many subtasks. */
      breakdownSubtasks: 2,
    },
    /** "Check in all habits due today" needs at least this many due. */
    allHabitsMin: 2,
    /** Tutorial quests (D31): XP per step and for the last one, which also gives a large box. */
    tutorial: { stepXp: 20, lastXp: 50, days: 365 },
  },
  /** What the challenge answer changes (D36). */
  challenge: {
    /** forgetting: quick quests a day on top of `quests.quickPerDay`. */
    extraQuick: 1,
    /** next_step: Today's visible items, and the weight of "pick the next action" quests. */
    todayVisible: 3,
    pinNextNeed: 2,
    /** missed_day: inactive days that bring the comeback quest. */
    comebackAfterDays: 1,
    /** too_many: the active-project limit set when this is the answer (only ever lowered). */
    activeProjectLimit: 2,
    /** motivation: a daily quest doesn't come back for this many days. */
    varietyDays: 3,
  },
} as const;
