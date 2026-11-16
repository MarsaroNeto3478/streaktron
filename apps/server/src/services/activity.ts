// Writing the activity log (D8). Counting mutations call `recordActivity` inside their own
// transaction, so the log and the change commit together. Each request collects what it recorded
// (and which entities it touched) in an async-local scope; once the write has committed, the game
// middleware evaluates quests and answers with the events (http/game.ts).

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Activity, ActivityPayloads, ActivityType } from '@strekatron/shared/game';
import { newId } from '@strekatron/shared/ids';
import { userDay, type DateString } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { activity, userSettings } from '../db/schema';
import type { Conn } from './common';

export interface GameScope {
  userId: string | null;
  /** Activities recorded by this request (committed or not: a failed request is never evaluated). */
  activities: Activity[];
  /** Entities whose details changed (follow-up quests watch these). */
  touched: Set<string>;
  /** When the change was made, for a write made offline and sent later (D55); null: now. */
  occurredAt: Date | null;
}

const scope = new AsyncLocalStorage<GameScope>();

/** Run `fn` collecting what it records, for the game evaluation after the write. */
export function withGameScope<T>(
  fn: (s: GameScope) => Promise<T>,
  occurredAt: Date | null = null,
): Promise<T> {
  const s: GameScope = { userId: null, activities: [], touched: new Set(), occurredAt };
  return scope.run(s, () => fn(s));
}

/**
 * When the change this request makes happened: now, or, for a write made offline and sent later,
 * when it was made (D55). Activity, completion times and check-in days use it, so a task done on
 * the bus counts for the day it was done; quests are still evaluated now.
 */
export const requestTime = () => scope.getStore()?.occurredAt ?? new Date();

/** Mark entities whose details changed in this request. */
export function touch(userId: string, ...ids: (string | null | undefined)[]) {
  const s = scope.getStore();
  if (!s) return;
  s.userId ??= userId;
  for (const id of ids) if (id) s.touched.add(id);
}

export interface DaySettingsRow {
  timezone: string;
  dayStartHour: number;
}

/** The user's day at `at`, from their stored settings (D17). */
export async function userToday(conn: Conn, userId: string, at = new Date()): Promise<DateString> {
  const [row] = await conn
    .select({ timezone: userSettings.timezone, dayStartHour: userSettings.dayStartHour })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return dayOf(row, at);
}

export const dayOf = (row: DaySettingsRow | undefined, at = new Date()) =>
  userDay(at, { timeZone: row?.timezone ?? 'UTC', dayStartHour: row?.dayStartHour ?? 4 });

export type ActivityInput = {
  [T in ActivityType]: { type: T; entityId: string | null; payload: ActivityPayloads[T] };
}[ActivityType];

/** Append to the log, in the caller's transaction. */
export async function recordActivity(
  conn: Conn,
  userId: string,
  entries: ActivityInput | ActivityInput[],
  at = requestTime(),
): Promise<Activity[]> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return [];
  const localDate = await userToday(conn, userId, at);
  const rows = list.map((e) => ({
    id: newId('activity'),
    userId,
    type: e.type,
    entityId: e.entityId,
    occurredAt: at,
    localDate,
    payload: e.payload,
  }));
  await conn.insert(activity).values(rows);
  const recorded = rows.map(({ userId: _, ...r }) => r as Activity);
  const s = scope.getStore();
  if (s) {
    s.userId ??= userId;
    s.activities.push(...recorded);
  }
  return recorded;
}
