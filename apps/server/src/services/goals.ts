// Goals of a project: outcomes (optionally with a deadline) and commitments (focus minutes per
// week or month). A commitment carries its progress: focus on its project this period, and the
// pace to hit the target (D40).

import type { GoalCreate, GoalPatch } from '@strekatron/shared/schemas';
import { goalShapeProblem } from '@strekatron/shared/schemas';
import { newId } from '@strekatron/shared/ids';
import {
  commitmentProgress,
  goalMinutesFrom,
  type CommitmentProgress,
} from '@strekatron/shared/structure';
import type { DateString } from '@strekatron/shared/time';
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, goals, userSettings } from '../db/schema';
import { defined, edgeOrder, invalid, notFound, richColumns, type Conn } from './common';
import { dayOf, recordActivity, touch } from './activity';
import { writeLinks } from './links';
import { ownedProject } from './projects';

type GoalRow = typeof goals.$inferSelect;
export type GoalView = Omit<GoalRow, 'userId' | 'deletedAt'> & {
  /** Commitment goals only. */
  progress: CommitmentProgress | null;
};

/** The goals as the API shows them, commitments with their progress (D40). */
async function views(conn: Conn, userId: string, rows: GoalRow[]): Promise<GoalView[]> {
  const commitments = rows.filter((g) => g.kind === 'commitment' && g.targetMinutes && g.period);
  const progress = new Map<string, CommitmentProgress>();
  if (commitments.length) {
    const [s] = await conn
      .select({
        timezone: userSettings.timezone,
        dayStartHour: userSettings.dayStartHour,
        weekStart: userSettings.weekStart,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    const today = dayOf(s);
    const weekStart = s?.weekStart ?? 1;
    const plans = commitments.map((g) => {
      const createdOn = dayOf(s, g.createdAt);
      const ref = g.dueDate && g.dueDate < today ? g.dueDate : today;
      return { g, createdOn, from: goalMinutesFrom(ref, g.period!, weekStart, createdOn) };
    });
    const from = plans.reduce((a, p) => (p.from < a ? p.from : a), today);
    const byProject = await focusMinutesByDay(
      conn,
      userId,
      [...new Set(commitments.map((g) => g.projectId))],
      from,
    );
    for (const { g, createdOn } of plans) {
      progress.set(
        g.id,
        commitmentProgress({
          today,
          period: g.period!,
          weekStart,
          target: g.targetMinutes!,
          until: g.dueDate,
          createdOn,
          minutesByDay: byProject.get(g.projectId) ?? new Map(),
        }),
      );
    }
  }
  return rows.map(({ userId: _, deletedAt: __, ...g }) => ({
    ...g,
    progress: progress.get(g.id) ?? null,
  }));
}

/** Finished focus per project and day, from the activity log. */
async function focusMinutesByDay(
  conn: Conn,
  userId: string,
  projectIds: string[],
  from: DateString,
): Promise<Map<string, Map<DateString, number>>> {
  const projectId = sql<string>`${activity.payload}->>'projectId'`;
  const rows = await conn
    .select({
      projectId,
      day: activity.localDate,
      minutes: sql<number>`sum((${activity.payload}->>'minutes')::int)::int`,
    })
    .from(activity)
    .where(
      and(
        eq(activity.userId, userId),
        eq(activity.type, 'focus_completed'),
        gte(activity.localDate, from),
        inArray(projectId, projectIds),
      ),
    )
    .groupBy(projectId, activity.localDate);
  const out = new Map<string, Map<DateString, number>>();
  for (const r of rows) {
    if (!out.has(r.projectId)) out.set(r.projectId, new Map());
    out.get(r.projectId)!.set(r.day, r.minutes);
  }
  return out;
}

const view = async (conn: Conn, userId: string, row: GoalRow) =>
  (await views(conn, userId, [row]))[0]!;

export async function listGoals(conn: Conn, userId: string, projectId: string) {
  const rows = await conn
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.projectId, projectId), isNull(goals.deletedAt)))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  return views(conn, userId, rows);
}

async function ownedGoal(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('goal');
  return row;
}

export async function createGoal(userId: string, input: GoalCreate) {
  return db.transaction(async (tx) => {
    await ownedProject(tx, userId, input.projectId);
    const outcome = input.kind === 'outcome';
    const id = newId('goal');
    const [row] = await tx
      .insert(goals)
      .values({
        id,
        userId,
        projectId: input.projectId,
        title: input.title,
        kind: input.kind,
        targetMinutes: outcome ? null : (input.targetMinutes ?? null),
        period: outcome ? null : (input.period ?? null),
        dueDate: input.dueDate ?? null,
        sortOrder: await edgeOrder(
          tx,
          goals,
          and(eq(goals.projectId, input.projectId), isNull(goals.deletedAt)),
          'bottom',
        ),
        ...richColumns(input.description),
      })
      .returning();
    await writeLinks(tx, userId, id, input.description);
    await recordActivity(tx, userId, {
      type: 'item_created',
      entityId: id,
      payload: { kind: 'goal', projectId: input.projectId, parentTaskId: null },
    });
    return view(tx, userId, row!);
  });
}

/** One goal (the goal sheet). */
export async function getGoal(userId: string, id: string) {
  return view(db, userId, await ownedGoal(db, userId, id));
}

export async function updateGoal(userId: string, id: string, patch: GoalPatch) {
  return db.transaction(async (tx) => {
    const goal = await ownedGoal(tx, userId, id);
    const { description, ...rest } = patch;
    const next = { ...goal, ...defined(rest) };
    // An outcome has no target; switching kinds drops it rather than failing.
    if (next.kind === 'outcome') Object.assign(next, { targetMinutes: null, period: null });
    const problem = goalShapeProblem(next);
    if (problem) throw invalid('invalid_goal', problem);
    const [row] = await tx
      .update(goals)
      .set({
        ...defined(rest),
        targetMinutes: next.targetMinutes,
        period: next.period,
        ...richColumns(description),
      })
      .where(eq(goals.id, id))
      .returning();
    await writeLinks(tx, userId, id, description);
    touch(userId, id);
    return view(tx, userId, row!);
  });
}

/** Soft delete; tasks keep pointing at it so an undo restores everything. */
export async function deleteGoal(userId: string, id: string) {
  await ownedGoal(db, userId, id);
  const deletedAt = new Date();
  await db.update(goals).set({ deletedAt }).where(eq(goals.id, id));
  touch(userId, id);
  return { id, deletedAt };
}

export async function restoreGoal(userId: string, id: string) {
  await ownedGoal(db, userId, id, { deleted: true });
  const [row] = await db
    .update(goals)
    .set({ deletedAt: null })
    .where(and(eq(goals.id, id), isNotNull(goals.deletedAt)))
    .returning();
  return view(db, userId, row!);
}
