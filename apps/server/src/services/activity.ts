// Writing the activity log (D8). Counting mutations call `recordActivity` inside their own
// transaction, so the log and the change commit together. Each request collects what it recorded
// (and which entities it touched) in an async-local scope; once the write has committed, the game
// middleware evaluates quests and answers with the events (http/game.ts).

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Activity, ActivityPayloads, ActivityType } from '@streaktron/shared/game';
import { newId } from '@streaktron/shared/ids';
import { userDay, type DateString } from '@streaktron/shared/time';
import { eq } from 'drizzle-orm';
import { activity, userSettings } from '../db/schema';
import type { Conn } from './common';

export interface GameScope {
  userId: string | null;
  /** Activities recorded by this request (committed or not: a failed request is never evaluated). */
  activities: Activity[];
  /** Entities whose details changed (follow-up quests watch these). */
  touched: Set<string>;
}

const scope = new AsyncLocalStorage<GameScope>();

/** Run `fn` collecting what it records, for the game evaluation after the write. */
export function withGameScope<T>(fn: (s: GameScope) => Promise<T>): Promise<T> {
  const s: GameScope = { userId: null, activities: [], touched: new Set() };
  return scope.run(s, () => fn(s));
}

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
  at = new Date(),
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
