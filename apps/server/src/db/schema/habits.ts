// Habits (Phase 4): recurring things with a schedule, and one check-in row per habit and day.
// The XP and active days a check-in brings come from the activity log (`habit_checked`), not from
// these rows, so unchecking never takes anything away (D15).

import type { HabitSchedule } from '@strekatron/shared/habits';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { projects } from './structure';

const userId = () =>
  text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const habits = pgTable(
  'habits',
  {
    id: text().primaryKey(),
    userId: userId(),
    /** Optional; a deleted project leaves its habits standing on their own. */
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    title: text().notNull(),
    /** Plain text: habits aren't mention sources (no backlinks to keep). */
    notes: text().notNull().default(''),
    schedule: jsonb().$type<HabitSchedule>().notNull(),
    minMinutes: integer(),
    sortOrder: integer().notNull().default(0),
    /** Archived: off Today and out of quests, history kept. */
    archivedAt: timestamp({ withTimezone: true }),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const habitCheckins = pgTable(
  'habit_checkins',
  {
    id: text().primaryKey(),
    userId: userId(),
    habitId: text()
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    date: date({ mode: 'string' }).notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.habitId, t.date), index().on(t.userId, t.date)],
);
