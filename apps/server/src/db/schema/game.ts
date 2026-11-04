// Gamification (D8): the append-only activity log everything is computed from, focus sessions, and
// quest instances. XP, levels and streaks are never stored; they're derived from `activity`.

import type { ActivityPayloads, ActivityType } from '@streaktron/shared/game';
import { ACTIVITY_TYPES, BOX_TIERS, QUEST_STATUSES, QUEST_TYPES } from '@streaktron/shared/game';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { projects, tasks } from './structure';

const userId = () =>
  text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

const day = () => date({ mode: 'string' });

const oneOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`;

/** One row per thing that counts. Never updated or deleted (only with the account). */
export const activity = pgTable(
  'activity',
  {
    id: text().primaryKey(),
    userId: userId(),
    type: text({ enum: ACTIVITY_TYPES }).$type<ActivityType>().notNull(),
    /** What it's about; no foreign key, so the log outlives deletes. */
    entityId: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** The user's day it counts for, fixed when written (D17). */
    localDate: day().notNull(),
    payload: jsonb().$type<ActivityPayloads[ActivityType]>().notNull(),
  },
  (t) => [
    index().on(t.userId, t.localDate),
    index().on(t.userId, t.type, t.entityId),
    check('activity_type', oneOf(t.type, ACTIVITY_TYPES)),
  ],
);

export const FOCUS_STATUSES = ['running', 'paused', 'completed', 'abandoned'] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: text().primaryKey(),
    userId: userId(),
    taskId: text().references(() => tasks.id, { onDelete: 'set null' }),
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    plannedMinutes: integer().notNull(),
    /** Time spent paused before the current pause. */
    pausedMs: integer().notNull().default(0),
    /** Set while paused. */
    pausedAt: timestamp({ withTimezone: true }),
    status: text({ enum: FOCUS_STATUSES }).notNull().default('running'),
    /** Minutes credited when it was completed. */
    minutes: integer(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.startedAt),
    // One open session per user.
    uniqueIndex('focus_sessions_one_open')
      .on(t.userId)
      .where(sql`status in ('running', 'paused')`),
    check('focus_sessions_status', oneOf(t.status, FOCUS_STATUSES)),
    check('focus_sessions_planned', sql`${t.plannedMinutes} between 1 and 240`),
  ],
);

export const quests = pgTable(
  'quests',
  {
    id: text().primaryKey(),
    userId: userId(),
    type: text({ enum: QUEST_TYPES }).notNull(),
    templateKey: text().notNull(),
    title: text().notNull(),
    periodStart: day().notNull(),
    /** The last day it can be done (inclusive). */
    periodEnd: day().notNull(),
    target: integer().notNull(),
    /** Progress when last evaluated (shown on the board). */
    progress: integer().notNull().default(0),
    rewardXp: integer().notNull(),
    boxTier: text({ enum: BOX_TIERS }).notNull(),
    /** What it's about (a project, task or goal); no foreign key, it may be deleted. */
    targetEntityId: text(),
    params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** A follow-up's make quest. */
    parentQuestId: text().references((): AnyPgColumn => quests.id, { onDelete: 'set null' }),
    /** The quest this one replaced by a reroll (a replacement can't be rerolled again). */
    rerollOf: text().references((): AnyPgColumn => quests.id, { onDelete: 'set null' }),
    status: text({ enum: QUEST_STATUSES }).notNull().default('offered'),
    offeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When it completed, expired, was rerolled or cancelled. */
    closedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.status, t.periodEnd),
    index().on(t.userId, t.periodStart),
    check('quests_status', oneOf(t.status, QUEST_STATUSES)),
    check('quests_type', oneOf(t.type, QUEST_TYPES)),
  ],
);
