// Habits (Phase 4): CRUD, check-ins and the views Today and the Habits page show. Schedules and
// streaks are pure rules in `@strekatron/shared/habits`; this file loads the dates and asks them.
//
// A check-in writes a `habit_checked` activity (10 XP once per habit and day, an active day).
// Unchecking deletes the row only: the activity stays, so nothing is taken away (D15) and checking
// in again earns nothing more. A forgotten check-in can be made for yesterday (D34): it counts for
// the habit's own streak, while the XP and the active day go to today, so past days can't be
// filled in after the fact.

import {
  CHECKIN_BACKDATE_DAYS,
  dueOn,
  habitStreak,
  recentDays,
  weekCount,
  type HabitStreak,
} from '@strekatron/shared/habits';
import { newId } from '@strekatron/shared/ids';
import type { HabitCheckin, HabitCreate, HabitPatch } from '@strekatron/shared/schemas';
import { addDays, type DateString } from '@strekatron/shared/time';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { habitCheckins, habits, userSettings } from '../db/schema';
import { dayOf, recordActivity, touch, userToday } from './activity';
import { defined, edgeOrder, invalid, notFound, type Conn } from './common';
import { ownedProject } from './projects';

type HabitRow = typeof habits.$inferSelect;

export interface HabitView {
  id: string;
  title: string;
  notes: string;
  projectId: string | null;
  schedule: HabitRow['schedule'];
  minMinutes: number | null;
  archivedAt: Date | null;
  createdAt: Date;
  /** On today's list (scheduled, or the week's count not reached yet). */
  dueToday: boolean;
  checkedToday: boolean;
  checkedYesterday: boolean;
  /** Per-week habits: check-ins this week. */
  thisWeek: number;
  streak: HabitStreak;
  /** The last 7 days, oldest first. */
  recent: { day: DateString; checked: boolean; scheduled: boolean }[];
}

async function dayContext(conn: Conn, userId: string) {
  const [row] = await conn
    .select({
      timezone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      weekStart: userSettings.weekStart,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return {
    today: dayOf(row),
    weekStart: row?.weekStart ?? 1,
    /** The user's day an instant fell on. */
    dayAt: (at: Date) => dayOf(row, at),
  };
}

/** Every check-in date of these habits. */
async function checkinsOf(conn: Conn, ids: string[]): Promise<Map<string, Set<DateString>>> {
  const out = new Map<string, Set<DateString>>(ids.map((id) => [id, new Set()]));
  if (!ids.length) return out;
  const rows = await conn
    .select({ habitId: habitCheckins.habitId, date: habitCheckins.date })
    .from(habitCheckins)
    .where(inArray(habitCheckins.habitId, ids));
  for (const r of rows) out.get(r.habitId)?.add(r.date);
  return out;
}

function toView(
  h: HabitRow,
  dates: ReadonlySet<DateString>,
  today: DateString,
  since: DateString,
  weekStart: number,
): HabitView {
  return {
    id: h.id,
    title: h.title,
    notes: h.notes,
    projectId: h.projectId,
    schedule: h.schedule,
    minMinutes: h.minMinutes,
    archivedAt: h.archivedAt,
    createdAt: h.createdAt,
    dueToday: dueOn(h.schedule, today, dates, weekStart),
    checkedToday: dates.has(today),
    checkedYesterday: dates.has(addDays(today, -1)),
    thisWeek: weekCount(dates, today, weekStart),
    streak: habitStreak(h.schedule, dates, today, weekStart, since),
    // Days before the habit existed weren't asked of it.
    recent: recentDays(h.schedule, dates, today).map((d) => ({
      ...d,
      scheduled: d.scheduled && d.day >= since,
    })),
  };
}

/** Views of the user's habits (not deleted), in their order. */
async function views(
  conn: Conn,
  userId: string,
  where: { archived?: boolean; ids?: string[] } = {},
): Promise<HabitView[]> {
  const conds = [eq(habits.userId, userId), isNull(habits.deletedAt)];
  if (where.archived === true) conds.push(isNotNull(habits.archivedAt));
  if (where.archived === false) conds.push(isNull(habits.archivedAt));
  if (where.ids) conds.push(inArray(habits.id, where.ids));
  const rows = await conn
    .select()
    .from(habits)
    .where(and(...conds))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt));
  if (!rows.length) return [];
  const ctx = await dayContext(conn, userId);
  const dates = await checkinsOf(
    conn,
    rows.map((r) => r.id),
  );
  // A habit's streak starts the day it was made.
  return rows.map((h) =>
    toView(h, dates.get(h.id)!, ctx.today, ctx.dayAt(h.createdAt), ctx.weekStart),
  );
}

export const listHabits = (userId: string, archived = false) => views(db, userId, { archived });

async function one(conn: Conn, userId: string, id: string): Promise<HabitView> {
  const [v] = await views(conn, userId, { ids: [id] });
  if (!v) throw notFound('habit');
  return v;
}

export const getHabit = (userId: string, id: string) => one(db, userId, id);

/** Habits on today's list and not checked in yet (quests). */
export async function habitsDueToday(conn: Conn, userId: string) {
  return (await views(conn, userId, { archived: false }))
    .filter((h) => h.dueToday && !h.checkedToday)
    .map((h) => ({ id: h.id, title: h.title }));
}

/** Today's habits, done ones included (the Today page). */
export async function todayHabits(conn: Conn, userId: string) {
  return (await views(conn, userId, { archived: false })).filter((h) => h.dueToday);
}

async function ownedHabit(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('habit');
  return row;
}

export async function createHabit(userId: string, input: HabitCreate) {
  return db.transaction(async (tx) => {
    if (input.projectId) await ownedProject(tx, userId, input.projectId);
    const id = newId('habit');
    await tx.insert(habits).values({
      id,
      userId,
      projectId: input.projectId ?? null,
      title: input.title,
      notes: input.notes ?? '',
      schedule: input.schedule,
      minMinutes: input.minMinutes ?? null,
      sortOrder: await edgeOrder(
        tx,
        habits,
        and(eq(habits.userId, userId), isNull(habits.deletedAt)),
        'bottom',
      ),
    });
    return one(tx, userId, id);
  });
}

export async function updateHabit(userId: string, id: string, patch: HabitPatch) {
  return db.transaction(async (tx) => {
    await ownedHabit(tx, userId, id);
    const { archived, ...rest } = patch;
    if (rest.projectId) await ownedProject(tx, userId, rest.projectId);
    const values: Partial<HabitRow> = defined(rest);
    if (archived !== undefined) values.archivedAt = archived ? new Date() : null;
    if (Object.keys(values).length) await tx.update(habits).set(values).where(eq(habits.id, id));
    touch(userId, id);
    return one(tx, userId, id);
  });
}

/** Soft delete; check-ins stay, so an undo restores the streak too. */
export async function deleteHabit(userId: string, id: string) {
  await ownedHabit(db, userId, id);
  const deletedAt = new Date();
  await db.update(habits).set({ deletedAt }).where(eq(habits.id, id));
  return { id, deletedAt };
}

export async function restoreHabit(userId: string, id: string) {
  await ownedHabit(db, userId, id, { deleted: true });
  await db.update(habits).set({ deletedAt: null }).where(eq(habits.id, id));
  return one(db, userId, id);
}

async function checkinDay(conn: Conn, userId: string, date: DateString | undefined) {
  const today = await userToday(conn, userId);
  const day = date ?? today;
  if (day > today || day < addDays(today, -CHECKIN_BACKDATE_DAYS)) {
    throw invalid('invalid_checkin_date', 'Check in for today, or yesterday if you forgot.');
  }
  return day;
}

export async function checkIn(userId: string, id: string, input: HabitCheckin) {
  return db.transaction(async (tx) => {
    const habit = await ownedHabit(tx, userId, id);
    if (habit.archivedAt) throw invalid('habit_archived', 'Unarchive the habit to check in.');
    const date = await checkinDay(tx, userId, input.date);
    const inserted = await tx
      .insert(habitCheckins)
      .values({ id: newId('habitCheckin'), userId, habitId: id, date, note: input.note ?? null })
      .onConflictDoNothing()
      .returning({ id: habitCheckins.id });
    if (inserted.length) {
      const [settings] = await tx
        .select({ timezone: userSettings.timezone, dayStartHour: userSettings.dayStartHour })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));
      await recordActivity(tx, userId, {
        type: 'habit_checked',
        entityId: id,
        // The habit's first day: a check-in then earns no XP (D37).
        payload: {
          date,
          projectId: habit.projectId,
          habitCreatedOn: dayOf(settings, habit.createdAt),
        },
      });
    }
    return one(tx, userId, id);
  });
}

export async function uncheck(userId: string, id: string, date: DateString) {
  return db.transaction(async (tx) => {
    await ownedHabit(tx, userId, id);
    await tx
      .delete(habitCheckins)
      .where(and(eq(habitCheckins.habitId, id), eq(habitCheckins.date, date)));
    return one(tx, userId, id);
  });
}
