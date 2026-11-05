// Focus sessions (plan.md §4.4): one open session per user, kept on the server (start time and
// pauses) so it survives reloads and devices. Finishing credits the minutes actually worked, at most
// the planned length (a forgotten timer doesn't keep counting), and logs `focus_completed`.

import type { FocusFinish, FocusStart } from '@strekatron/shared/schemas';
import { newId } from '@strekatron/shared/ids';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { focusSessions, projects, tasks } from '../db/schema';
import { recordActivity } from './activity';
import { conflict, notFound, type Conn } from './common';
import { ownedProject } from './projects';
import { completeTask } from './tasks';

type SessionRow = typeof focusSessions.$inferSelect;

const OPEN = ['running', 'paused'] as const;

/** Milliseconds worked so far (or in all, once ended). */
export function workedMs(
  s: Pick<SessionRow, 'startedAt' | 'endedAt' | 'pausedMs' | 'pausedAt'>,
  now = new Date(),
) {
  const end = s.endedAt ?? s.pausedAt ?? now;
  return Math.max(0, end.getTime() - s.startedAt.getTime() - s.pausedMs);
}

async function sessionView(conn: Conn, row: SessionRow, now = new Date()) {
  const [task] = row.taskId
    ? await conn
        .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
        .from(tasks)
        .where(eq(tasks.id, row.taskId))
    : [];
  const [project] = row.projectId
    ? await conn
        .select({
          id: projects.id,
          title: projects.title,
          color: projects.color,
          icon: projects.icon,
        })
        .from(projects)
        .where(eq(projects.id, row.projectId))
    : [];
  return {
    id: row.id,
    status: row.status,
    plannedMinutes: row.plannedMinutes,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    pausedAt: row.pausedAt,
    pausedMs: row.pausedMs,
    /** Worked so far, by the server's clock (the client counts on from here). */
    workedMs: workedMs(row, now),
    serverNow: now,
    minutes: row.minutes,
    note: row.note,
    task: task ?? null,
    project: project ?? null,
  };
}
export type FocusView = Awaited<ReturnType<typeof sessionView>>;

async function openSession(conn: Conn, userId: string, id?: string) {
  const [row] = await conn
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        inArray(focusSessions.status, [...OPEN]),
        id ? eq(focusSessions.id, id) : undefined,
      ),
    )
    .for('update');
  return row ?? null;
}

export async function currentFocus(userId: string) {
  const row = await openSession(db, userId);
  return row ? sessionView(db, row) : null;
}

export async function startFocus(userId: string, input: FocusStart) {
  return db.transaction(async (tx) => {
    if (await openSession(tx, userId)) {
      throw conflict('focus_running', 'A focus session is already running. Finish it first.');
    }
    let projectId = input.projectId ?? null;
    if (input.taskId) {
      const [task] = await tx
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      if (!task) throw notFound('task');
      projectId = task.projectId;
    } else if (projectId) {
      await ownedProject(tx, userId, projectId);
    }
    const [row] = await tx
      .insert(focusSessions)
      .values({
        id: newId('focusSession'),
        userId,
        taskId: input.taskId ?? null,
        projectId,
        startedAt: new Date(),
        plannedMinutes: input.plannedMinutes,
      })
      .returning();
    return sessionView(tx, row!);
  });
}

async function mustBeOpen(conn: Conn, userId: string, id: string) {
  const row = await openSession(conn, userId, id);
  if (row) return row;
  const [any] = await conn
    .select({ id: focusSessions.id })
    .from(focusSessions)
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)));
  if (!any) throw notFound('focus session');
  throw conflict('focus_over', 'That focus session is already over.');
}

export async function pauseFocus(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const row = await mustBeOpen(tx, userId, id);
    if (row.status === 'paused') return sessionView(tx, row);
    const [next] = await tx
      .update(focusSessions)
      .set({ status: 'paused', pausedAt: new Date() })
      .where(eq(focusSessions.id, id))
      .returning();
    return sessionView(tx, next!);
  });
}

export async function resumeFocus(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const row = await mustBeOpen(tx, userId, id);
    if (row.status === 'running') return sessionView(tx, row);
    const now = new Date();
    const [next] = await tx
      .update(focusSessions)
      .set({
        status: 'running',
        pausedAt: null,
        pausedMs: row.pausedMs + (now.getTime() - row.pausedAt!.getTime()),
      })
      .where(eq(focusSessions.id, id))
      .returning();
    return sessionView(tx, next!);
  });
}

export async function finishFocus(userId: string, id: string, input: FocusFinish) {
  const session = await db.transaction(async (tx) => {
    const row = await mustBeOpen(tx, userId, id);
    const now = new Date();
    // Time paused up to now counts as paused, not worked.
    const pausedMs = row.pausedAt
      ? row.pausedMs + (now.getTime() - row.pausedAt.getTime())
      : row.pausedMs;
    const worked = Math.max(0, now.getTime() - row.startedAt.getTime() - pausedMs);
    const minutes = Math.min(Math.floor(worked / 60_000), row.plannedMinutes);
    const [next] = await tx
      .update(focusSessions)
      .set({
        status: 'completed',
        endedAt: now,
        pausedAt: null,
        pausedMs,
        minutes,
        note: input.note || null,
      })
      .where(eq(focusSessions.id, id))
      .returning();
    if (minutes > 0) {
      await recordActivity(
        tx,
        userId,
        {
          type: 'focus_completed',
          entityId: id,
          payload: { minutes, projectId: row.projectId, taskId: row.taskId },
        },
        now,
      );
    }
    return next!;
  });
  // A separate write: the session counts even if the task can't be completed anymore.
  let task = null;
  if (input.completeTask && session.taskId) {
    task = await completeTask(userId, session.taskId).catch(() => null);
  }
  return { session: await sessionView(db, session), task };
}

export async function abandonFocus(userId: string, id: string) {
  return db.transaction(async (tx) => {
    await mustBeOpen(tx, userId, id);
    const [next] = await tx
      .update(focusSessions)
      .set({ status: 'abandoned', endedAt: new Date(), pausedAt: null })
      .where(eq(focusSessions.id, id))
      .returning();
    return sessionView(tx, next!);
  });
}
