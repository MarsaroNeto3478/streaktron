import { CHALLENGES, TUTORIAL_STATES, type TutorialState } from '@streaktron/shared/game';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@streaktron/shared/schemas';
import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

const d = DEFAULT_USER_SETTINGS;

/** One row per user, made with the account. The user's day comes from timezone + day_start_hour (D17). */
export const userSettings = pgTable(
  'user_settings',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    timezone: text().notNull().default(d.timezone),
    /** Last time the time zone changed; changes are rate-limited so days can't be farmed. */
    timezoneChangedAt: timestamp({ withTimezone: true }),
    dayStartHour: smallint().notNull().default(d.dayStartHour),
    /** 0 = Sunday … 6 = Saturday. */
    weekStart: smallint().notNull().default(d.weekStart),
    activeProjectLimit: smallint().notNull().default(d.activeProjectLimit),
    weeklyActiveDayTarget: smallint().notNull().default(d.weeklyActiveDayTarget),
    focusPresets: jsonb().$type<UserSettings['focusPresets']>().notNull().default(d.focusPresets),
    questSettings: jsonb()
      .$type<UserSettings['questSettings']>()
      .notNull()
      .default(d.questSettings),
    /** The answer to Streaky's question (D32, D36); null: not answered or skipped. */
    challenge: text({ enum: CHALLENGES }),
    /** Where the tour is (D31): new accounts and existing ones start at `new` (an invitation). */
    tutorial: text({ enum: TUTORIAL_STATES }).$type<TutorialState>().notNull().default('new'),
    ...timestamps,
  },
  (t) => [
    check('user_settings_day_start_hour', sql`${t.dayStartHour} between 0 and 23`),
    check('user_settings_week_start', sql`${t.weekStart} between 0 and 6`),
    check('user_settings_active_project_limit', sql`${t.activeProjectLimit} >= 1`),
    check('user_settings_weekly_target', sql`${t.weeklyActiveDayTarget} between 1 and 7`),
    check(
      'user_settings_challenge',
      sql.raw(`challenge is null or challenge in (${CHALLENGES.map((c) => `'${c}'`).join(', ')})`),
    ),
    check(
      'user_settings_tutorial',
      sql.raw(`tutorial in (${TUTORIAL_STATES.map((c) => `'${c}'`).join(', ')})`),
    ),
  ],
);
