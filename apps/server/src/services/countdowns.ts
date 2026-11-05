// Countdowns (Phase 4): how many days until the things with a date that matter. Automatic, nothing
// to mark (D39): events marked "count down" (D35), the due dates of active projects, and the next
// few open tasks (their due date, or else the day they're planned for).

import type { DateString } from '@streaktron/shared/time';
import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { projects, tasks } from '../db/schema';
import type { Conn } from './common';
import { countdowns as eventCountdowns } from './events';

export interface Countdown {
  kind: 'event' | 'project' | 'task';
  /** The event, project or task. */
  id: string;
  title: string;
  date: DateString;
  projectId: string | null;
}

/** This many upcoming tasks, on Today and on a project's page. */
const TASKS = 3;

/** A task's countdown date: its due date, or else the day it's planned for. */
const taskDate = sql<DateString>`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`;

/** Open top-level tasks with a date from today on, in the inbox or an active project. */
async function upcomingTasks(conn: Conn, userId: string, today: DateString): Promise<Countdown[]> {
  const rows = await conn
    .select({ id: tasks.id, title: tasks.title, date: taskDate, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.parentTaskId),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
        or(gte(tasks.dueDate, today), and(isNull(tasks.dueDate), gte(tasks.scheduledDate, today))),
        sql`(${tasks.projectId} is null or exists (select 1 from projects p where p.id = ${tasks.projectId} and p.status = 'active'))`,
      ),
    )
    .orderBy(asc(taskDate), asc(tasks.title))
    .limit(TASKS);
  return rows.map((t) => ({ kind: 'task', ...t }));
}

const byDate = (a: Countdown, b: Countdown) =>
  a.date.localeCompare(b.date) || a.title.localeCompare(b.title);

const fromEvents = async (conn: Conn, userId: string, today: DateString): Promise<Countdown[]> =>
  (await eventCountdowns(conn, userId, today)).map((e) => ({
    kind: 'event',
    id: e.eventId,
    title: e.title,
    date: e.date,
    projectId: e.projectId,
  }));

/** Today's countdowns: countdown events, active projects' due dates, the next tasks; soonest first. */
export async function todayCountdowns(conn: Conn, userId: string, today: DateString) {
  const [events, due, upcoming] = await Promise.all([
    fromEvents(conn, userId, today),
    conn
      .select({ id: projects.id, title: projects.title, date: projects.dueDate })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.status, 'active'),
          gte(projects.dueDate, today),
        ),
      ),
    upcomingTasks(conn, userId, today),
  ]);
  const deadlines: Countdown[] = due.map((p) => ({
    kind: 'project',
    id: p.id,
    title: p.title,
    date: p.date!,
    projectId: p.id,
  }));
  return [...events, ...deadlines, ...upcoming].sort(byDate);
}

/** A project's countdowns: its due date, its countdown events and its next tasks. */
export async function projectCountdowns(
  conn: Conn,
  userId: string,
  project: { id: string; title: string; dueDate: DateString | null },
  today: DateString,
) {
  const [events, due] = await Promise.all([
    fromEvents(conn, userId, today),
    // On the project's own page its tasks show whatever the project's status.
    conn
      .select({ id: tasks.id, title: tasks.title, date: taskDate })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.projectId, project.id),
          isNull(tasks.parentTaskId),
          isNull(tasks.completedAt),
          isNull(tasks.deletedAt),
          or(
            gte(tasks.dueDate, today),
            and(isNull(tasks.dueDate), gte(tasks.scheduledDate, today)),
          ),
        ),
      )
      .orderBy(asc(taskDate), asc(tasks.title))
      .limit(TASKS),
  ]);
  const out: Countdown[] = events.filter((e) => e.projectId === project.id);
  if (project.dueDate && project.dueDate >= today) {
    out.push({
      kind: 'project',
      id: project.id,
      title: project.title,
      date: project.dueDate,
      projectId: project.id,
    });
  }
  for (const t of due) {
    out.push({ kind: 'task', id: t.id, title: t.title, date: t.date, projectId: project.id });
  }
  return out.sort(byDate);
}
