// Calendar events (Phase 4, D35) and the calendar's view of a range: event occurrences, tasks with
// a due or scheduled date in it, and focus minutes per day. Repetition is expanded here with the
// pure rules in `@strekatron/shared/calendar`; nothing about occurrences is stored but skips.

import {
  nextOccurrence,
  occurrences,
  parseRRule,
  toRRule,
  type Recurrence,
} from '@strekatron/shared/calendar';
import { newId } from '@strekatron/shared/ids';
import {
  CALENDAR_MAX_DAYS,
  eventShapeProblem,
  type EventCreate,
  type EventPatch,
  type RecurrenceInput,
} from '@strekatron/shared/schemas';
import { addDays, daysBetween, type DateString } from '@strekatron/shared/time';
import { and, asc, between, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, calendarEvents, tasks } from '../db/schema';
import { defined, invalid, notFound, type Conn } from './common';
import { ownedProject } from './projects';
import { selectViews } from './tasks';

type EventRow = typeof calendarEvents.$inferSelect;

const recurrenceOf = (r: RecurrenceInput | null | undefined): string | null =>
  r ? toRRule({ ...r, interval: r.interval ?? 1 }) : null;

function view(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    projectId: row.projectId,
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    recurrence: parseRRule(row.recurrence),
    skipDates: row.skipDates,
    countdown: row.countdown,
  };
}
export type EventView = ReturnType<typeof view>;

/** One showing of an event: the day it starts on and the day it ends on (all-day spans). */
export interface Occurrence {
  eventId: string;
  date: DateString;
  endDate: DateString;
  title: string;
  projectId: string | null;
  startTime: string | null;
  endTime: string | null;
  countdown: boolean;
  repeats: boolean;
}

const span = (e: Pick<EventRow, 'startDate' | 'endDate'>) =>
  e.endDate ? daysBetween(e.startDate, e.endDate) : 0;

const asSeries = (e: EventRow) => ({
  startDate: e.startDate,
  recurrence: parseRRule(e.recurrence),
  skip: e.skipDates,
});

/** Occurrences touching [from, to], by day then time (all-day first). */
export async function occurrencesIn(
  conn: Conn,
  userId: string,
  from: DateString,
  to: DateString,
): Promise<Occurrence[]> {
  const rows = await conn
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        isNull(calendarEvents.deletedAt),
        lte(calendarEvents.startDate, to),
        or(
          isNotNull(calendarEvents.recurrence),
          sql`coalesce(${calendarEvents.endDate}, ${calendarEvents.startDate}) >= ${from}`,
        ),
      ),
    );
  const out: Occurrence[] = [];
  for (const e of rows) {
    const days = span(e);
    // A spanning occurrence that started before `from` still shows.
    for (const date of occurrences(asSeries(e), addDays(from, -days), to)) {
      out.push({
        eventId: e.id,
        date,
        endDate: addDays(date, days),
        title: e.title,
        projectId: e.projectId,
        startTime: e.startTime,
        endTime: e.endTime,
        countdown: e.countdown,
        repeats: e.recurrence !== null,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.title.localeCompare(b.title),
  );
}

/** Countdown events with their next occurrence from today, soonest first. */
export async function countdowns(conn: Conn, userId: string, today: DateString) {
  const rows = await conn
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        isNull(calendarEvents.deletedAt),
        eq(calendarEvents.countdown, true),
      ),
    );
  const out: { eventId: string; title: string; date: DateString; projectId: string | null }[] = [];
  for (const e of rows) {
    const date = nextOccurrence(asSeries(e), today);
    if (date) out.push({ eventId: e.id, title: e.title, date, projectId: e.projectId });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Everything the calendar shows for [from, to]. */
export async function calendarRange(userId: string, from: DateString, to: DateString) {
  if (daysBetween(from, to) > CALENDAR_MAX_DAYS) {
    throw invalid('range_too_long', `Ask for at most ${CALENDAR_MAX_DAYS} days at once.`);
  }
  const [events, dated, focus] = await Promise.all([
    occurrencesIn(db, userId, from, to),
    selectViews(
      db,
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        or(between(tasks.dueDate, from, to), between(tasks.scheduledDate, from, to)),
      ),
    ),
    db
      .select({
        date: activity.localDate,
        minutes: sql<number>`sum((${activity.payload}->>'minutes')::int)::int`,
      })
      .from(activity)
      .where(
        and(
          eq(activity.userId, userId),
          eq(activity.type, 'focus_completed'),
          between(activity.localDate, from, to),
        ),
      )
      .groupBy(activity.localDate)
      .orderBy(asc(activity.localDate)),
  ]);
  return { from, to, events, tasks: dated, focus };
}

// --- CRUD ------------------------------------------------------------------------------------

async function ownedEvent(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('event');
  return row;
}

export const getEvent = async (userId: string, id: string) =>
  view(await ownedEvent(db, userId, id));

export async function createEvent(userId: string, input: EventCreate) {
  return db.transaction(async (tx) => {
    if (input.projectId) await ownedProject(tx, userId, input.projectId);
    const [row] = await tx
      .insert(calendarEvents)
      .values({
        id: newId('event'),
        userId,
        projectId: input.projectId ?? null,
        title: input.title,
        notes: input.notes ?? '',
        startDate: input.startDate,
        endDate: input.endDate && input.endDate !== input.startDate ? input.endDate : null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        recurrence: recurrenceOf(input.recurrence),
        countdown: input.countdown ?? false,
      })
      .returning();
    return view(row!);
  });
}

export async function updateEvent(userId: string, id: string, patch: EventPatch) {
  return db.transaction(async (tx) => {
    const row = await ownedEvent(tx, userId, id);
    if (patch.projectId) await ownedProject(tx, userId, patch.projectId);
    const { recurrence, ...rest } = patch;
    const next = {
      ...view(row),
      ...defined(rest),
      recurrence: recurrence === undefined ? parseRRule(row.recurrence) : recurrence,
    };
    const problem = eventShapeProblem(next);
    if (problem) throw invalid('invalid_event', problem);
    const values: Partial<EventRow> = defined(rest);
    if (next.endDate === next.startDate) values.endDate = null;
    if (recurrence !== undefined) {
      values.recurrence = recurrenceOf(recurrence);
      // Skips belong to the old pattern; a new one starts clean.
      values.skipDates = [];
    } else if (rest.startDate && rest.startDate !== row.startDate) {
      values.skipDates = [];
    }
    const [updated] = await tx
      .update(calendarEvents)
      .set(values)
      .where(eq(calendarEvents.id, id))
      .returning();
    return view(updated!);
  });
}

/** Remove one occurrence of a repeating event. */
export async function skipOccurrence(userId: string, id: string, date: DateString) {
  return db.transaction(async (tx) => {
    const row = await ownedEvent(tx, userId, id);
    const rule: Recurrence | null = parseRRule(row.recurrence);
    if (!rule) throw invalid('not_repeating', 'Only a repeating event has occurrences to skip.');
    if (!occurrences(asSeries(row), date, date).length) throw notFound('occurrence');
    const [updated] = await tx
      .update(calendarEvents)
      .set({ skipDates: [...row.skipDates, date].sort() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return view(updated!);
  });
}

export async function deleteEvent(userId: string, id: string) {
  await ownedEvent(db, userId, id);
  const deletedAt = new Date();
  await db.update(calendarEvents).set({ deletedAt }).where(eq(calendarEvents.id, id));
  return { id, deletedAt };
}

export async function restoreEvent(userId: string, id: string) {
  await ownedEvent(db, userId, id, { deleted: true });
  const [row] = await db
    .update(calendarEvents)
    .set({ deletedAt: null })
    .where(eq(calendarEvents.id, id))
    .returning();
  return view(row!);
}
