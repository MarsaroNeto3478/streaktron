// The activity log (D8): one append-only row for everything that counts. XP, levels, streaks and
// quest progress are computed from it by the pure functions in this folder.

import type { DateString } from '../time';
import type { Effort } from '../structure';

export const ACTIVITY_TYPES = [
  'task_completed',
  'task_reopened',
  /** An inbox task given a project. */
  'task_triaged',
  /** A task, subtask or goal made (make quests). */
  'item_created',
  /** A task pinned as a project's next action. */
  'next_action_set',
  'focus_completed',
  'quest_completed',
  /** Every daily quest of a day done. */
  'quest_bonus',
  /** A habit checked in for a day (`payload.date`; may be yesterday's, D34). */
  'habit_checked',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type CreatedKind = 'task' | 'subtask' | 'goal';

export interface ActivityPayloads {
  task_completed: { effort: Effort | null; projectId: string | null; subtask: boolean };
  task_reopened: { projectId: string | null };
  task_triaged: { projectId: string };
  item_created: { kind: CreatedKind; projectId: string | null; parentTaskId: string | null };
  next_action_set: { projectId: string };
  focus_completed: { minutes: number; projectId: string | null; taskId: string | null };
  quest_completed: { questType: string; xp: number; boxTier: string };
  quest_bonus: { xp: number };
  habit_checked: { date: DateString; projectId: string | null };
}

/** An activity row as the rules read it. */
export type Activity = {
  [T in ActivityType]: {
    id: string;
    type: T;
    /** What it's about (a task, a session, a quest…); no foreign key, it may be gone. */
    entityId: string | null;
    /** The user's day it counts for, fixed when it was written (D17). */
    localDate: DateString;
    occurredAt: Date;
    payload: ActivityPayloads[T];
  };
}[ActivityType];

export type ActivityOf<T extends ActivityType> = Extract<Activity, { type: T }>;

export const isType = <T extends ActivityType>(a: Activity, type: T): a is ActivityOf<T> =>
  a.type === type;

/** Oldest first; ties broken by id (ULIDs sort by creation). */
export const byTime = (a: Activity, b: Activity) =>
  a.occurredAt.getTime() - b.occurredAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
