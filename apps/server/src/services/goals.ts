// Goals of a project: outcomes (optionally with a deadline) and commitments (focus minutes per
// week or month; progress arrives with focus sessions in Phase 3).

import type { GoalCreate, GoalPatch } from '@streaktron/shared/schemas';
import { goalShapeProblem } from '@streaktron/shared/schemas';
import { newId } from '@streaktron/shared/ids';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { goals } from '../db/schema';
import { defined, edgeOrder, invalid, notFound, richColumns, type Conn } from './common';
import { recordActivity, touch } from './activity';
import { writeLinks } from './links';
import { ownedProject } from './projects';

const view = ({ userId: _, deletedAt: __, ...g }: typeof goals.$inferSelect) => g;

export async function listGoals(conn: Conn, userId: string, projectId: string) {
  const rows = await conn
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.projectId, projectId), isNull(goals.deletedAt)))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  return rows.map(view);
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
    return view(row!);
  });
}

/** One goal (the goal sheet). */
export async function getGoal(userId: string, id: string) {
  return view(await ownedGoal(db, userId, id));
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
    return view(row!);
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
  return view(row!);
}
