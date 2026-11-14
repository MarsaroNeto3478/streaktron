// Web Push (Phase 4, D45): the user's devices that accepted notifications, and what was sent so
// each reminder goes out at most once (per user day, or per focus session).

import { pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The push service's URL for this browser; the browser's keys encrypt what's sent. */
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    lastSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.endpoint)],
);

export const pushSent = pgTable(
  'push_sent',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `habits:2026-11-13`, `streak:2026-11-13`, `focus:fcs_…`. */
    key: text().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
