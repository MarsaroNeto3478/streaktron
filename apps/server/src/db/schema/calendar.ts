// Calendar events (Phase 4, D35): on the user's local dates and wall-clock times, so a 9:00
// lecture stays at 9:00 across DST. A repeating event stores an RRULE and the dates it skips.

import { boolean, date, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { projects } from './structure';

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    title: text().notNull(),
    notes: text().notNull().default(''),
    startDate: date({ mode: 'string' }).notNull(),
    /** All-day events that span days. */
    endDate: date({ mode: 'string' }),
    /** "HH:MM"; null = all day. */
    startTime: text(),
    endTime: text(),
    /** RFC 5545 RRULE value (the subset in `@streaktron/shared/calendar`). */
    recurrence: text(),
    /** Occurrences removed from a repeating event (EXDATE). */
    skipDates: jsonb().$type<string[]>().notNull().default([]),
    countdown: boolean().notNull().default(false),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.startDate)],
);
