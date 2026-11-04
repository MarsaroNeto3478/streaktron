// Board columns. A board always keeps a done column and an open one (boardProblem); a column's
// category decides whether its tasks are done, so changing it completes or reopens them.

import type { ColumnCreate, ColumnPatch } from '@streaktron/shared/schemas';
import { newId } from '@streaktron/shared/ids';
import {
  boardProblem,
  checkedOrder,
  firstColumnOf,
  firstOpenColumn,
} from '@streaktron/shared/structure';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { boardColumns, tasks } from '../db/schema';
import { conflict, defined, edgeOrder, invalid, notFound, writeOrder, type Conn } from './common';
import { ownedProject, unpinClosed } from './projects';
import { moveColumnTasks, setDoneness } from './tasks';

const view = ({ userId: _, ...c }: typeof boardColumns.$inferSelect) => c;

export async function listColumns(conn: Conn, userId: string, projectId: string) {
  const rows = await conn
    .select()
    .from(boardColumns)
    .where(and(eq(boardColumns.userId, userId), eq(boardColumns.projectId, projectId)))
    .orderBy(asc(boardColumns.sortOrder), asc(boardColumns.createdAt));
  return rows.map(view);
}

async function ownedColumn(conn: Conn, userId: string, id: string) {
  const [row] = await conn
    .select()
    .from(boardColumns)
    .where(and(eq(boardColumns.id, id), eq(boardColumns.userId, userId)))
    .for('update');
  if (!row) throw notFound('column');
  return row;
}

export async function createColumn(userId: string, projectId: string, input: ColumnCreate) {
  return db.transaction(async (tx) => {
    await ownedProject(tx, userId, projectId, true);
    const sortOrder = await edgeOrder(
      tx,
      boardColumns,
      eq(boardColumns.projectId, projectId),
      'bottom',
    );
    const [row] = await tx
      .insert(boardColumns)
      .values({ id: newId('boardColumn'), userId, projectId, ...input, sortOrder })
      .returning();
    return view(row!);
  });
}

export async function updateColumn(userId: string, id: string, patch: ColumnPatch) {
  return db.transaction(async (tx) => {
    const column = await ownedColumn(tx, userId, id);
    await ownedProject(tx, userId, column.projectId, true);
    if (patch.category && patch.category !== column.category) {
      const columns = await listColumns(tx, userId, column.projectId);
      const problem = boardProblem(
        columns.map((c) => (c.id === id ? { category: patch.category! } : c)),
      );
      if (problem) throw conflict('board_rule', problem);
      const wasDone = column.category === 'done';
      const isDone = patch.category === 'done';
      if (wasDone !== isDone) {
        const own = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.columnId, id), isNull(tasks.parentTaskId)));
        await setDoneness(
          tx,
          userId,
          own.map((t) => t.id),
          isDone,
        );
        if (isDone) await unpinClosed(tx, [column.projectId]);
      }
    }
    const values = defined(patch);
    if (!Object.keys(values).length) return view(column);
    const [row] = await tx
      .update(boardColumns)
      .set(values)
      .where(eq(boardColumns.id, id))
      .returning();
    return view(row!);
  });
}

export async function reorderColumns(userId: string, projectId: string, ids: string[]) {
  return db.transaction(async (tx) => {
    await ownedProject(tx, userId, projectId, true);
    const columns = await listColumns(tx, userId, projectId);
    const order = checkedOrder(
      columns.map((c) => c.id),
      ids,
    );
    if (!order) throw conflict('order_changed', 'The board changed meanwhile. Try again.');
    await writeOrder(tx, boardColumns, userId, order);
    return listColumns(tx, userId, projectId);
  });
}

/**
 * Delete a column, moving its tasks to `moveTo`, or by default to the leftmost other column of the
 * same category (or any open one, or the done one).
 */
export async function deleteColumn(userId: string, id: string, moveTo?: string) {
  return db.transaction(async (tx) => {
    const column = await ownedColumn(tx, userId, id);
    await ownedProject(tx, userId, column.projectId, true);
    const rest = (await listColumns(tx, userId, column.projectId)).filter((c) => c.id !== id);
    const problem = boardProblem(rest);
    if (problem) throw conflict('board_rule', problem);

    const target = moveTo
      ? rest.find((c) => c.id === moveTo)
      : (firstColumnOf(rest, column.category) ??
        (column.category === 'done' ? firstColumnOf(rest, 'done') : firstOpenColumn(rest)));
    if (!target) throw invalid('invalid_column', 'Move the tasks to a column on the same board.');

    await moveColumnTasks(tx, userId, id, { ...target, userId });
    await tx.delete(boardColumns).where(eq(boardColumns.id, id));
    await unpinClosed(tx, [column.projectId]);
    return { id, movedTo: target.id };
  });
}
