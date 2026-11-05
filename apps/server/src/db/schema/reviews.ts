// The weekly review (Phase 4, D38): one row per user and week, written when the review is done.
// The XP, the active day and the quest come from the `review_completed` activity, not this table.

import { date, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

/** The week's numbers as they were when the review was done (kept for the history). */
export interface ReviewSummary {
  from: string;
  to: string;
  tasksDone: number;
  focusMinutes: number;
  activeDays: number;
  habitCheckins: number;
  xp: number;
}

export const weeklyReviews = pgTable(
  'weekly_reviews',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The first day of the week the review counts for. */
    weekStart: date({ mode: 'string' }).notNull(),
    /** The two questions, plain text. */
    wentWell: text().notNull().default(''),
    change: text().notNull().default(''),
    summary: jsonb().$type<ReviewSummary>().notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.userId, t.weekStart)],
);
