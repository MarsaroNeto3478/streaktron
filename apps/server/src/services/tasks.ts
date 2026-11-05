// Tasks: inbox, project boards, subtasks (one level). "Done" has one meaning: `completed_at` is
// set. On a board it agrees with the column's category: moving into a done column completes a task,
// completing one moves it there, and the other way round.

import type { TaskCreate, TaskListQuery, TaskMove, TaskPatch } from '@strekatron/shared/schemas';
import { newId } from '@strekatron/shared/ids';
import {
  firstColumnOf,
  firstOpenColumn,
  placeAt,
  type TaskStatus,
} from '@strekatron/shared/structure';
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { boardColumns, goals, tasks } from '../db/schema';
import {
  conflict,
  defined,
  edgeOrder,
  invalid,
  notFound,
  richColumns,
  writeOrder,
  type Conn,
  type Tx,
} from './common';
import { recordActivity, touch, type ActivityInput } from './activity';
import { writeLinks } from './links';
import { ownedProject, unpinClosed } from './projects';

type TaskRow = typeof tasks.$inferSelect;
type ColumnRow = typeof boardColumns.$inferSelect;

// --- Activity (D8) ---------------------------------------------------------------------------

type DonenessRow = Pick<TaskRow, 'id' | 'effort' | 'projectId' | 'parentTaskId'>;

/** The activity a task's completion or reopening writes. */
function donenessActivity(task: DonenessRow, done: boolean): ActivityInput {
  return done
    ? {
        type: 'task_completed',
        entityId: task.id,
        payload: { effort: task.effort, projectId: task.projectId, subtask: !!task.parentTaskId },
      }
    : { type: 'task_reopened', entityId: task.id, payload: { projectId: task.projectId } };
}

// --- Reading ---------------------------------------------------------------------------------

const viewColumns = {
  id: tasks.id,
  projectId: tasks.projectId,
  goalId: tasks.goalId,
  parentTaskId: tasks.parentTaskId,
  columnId: tasks.columnId,
  title: tasks.title,
  descriptionText: tasks.descriptionText,
  effort: tasks.effort,
  dueDate: tasks.dueDate,
  scheduledDate: tasks.scheduledDate,
  sortOrder: tasks.sortOrder,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  status: sql<TaskStatus>`case when ${tasks.completedAt} is not null then 'done' when ${boardColumns.category} = 'in_progress' then 'in_progress' else 'todo' end`,
  subtasks: sql<{ total: number; done: number }>`(
    select json_build_object('total', count(*)::int, 'done', (count(*) filter (where s.completed_at is not null))::int)
    from tasks s where s.parent_task_id = ${tasks.id} and s.deleted_at is null
  )`,
};

export function selectViews(conn: Conn, where: SQL | undefined) {
  return conn
    .select(viewColumns)
    .from(tasks)
    .leftJoin(boardColumns, eq(boardColumns.id, tasks.columnId))
    .where(where)
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
}
export type TaskView = Awaited<ReturnType<typeof selectViews>>[number];

export async function listTasks(userId: string, q: TaskListQuery) {
  return selectViews(
    db,
    and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      q.parent ? eq(tasks.parentTaskId, q.parent) : isNull(tasks.parentTaskId),
      q.project === 'inbox'
        ? isNull(tasks.projectId)
        : q.project
          ? eq(tasks.projectId, q.project)
          : undefined,
      q.status === 'open'
        ? isNull(tasks.completedAt)
        : q.status === 'done'
          ? isNotNull(tasks.completedAt)
          : undefined,
    ),
  );
}

export async function taskView(conn: Conn, userId: string, id: string) {
  const [view] = await selectViews(conn, and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!view) throw notFound('task');
  return view;
}

/** One task with its full description (the task page / sheet). */
export async function getTask(userId: string, id: string) {
  const [row] = await db
    .select({ description: tasks.description, deletedAt: tasks.deletedAt })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!row || row.deletedAt) throw notFound('task');
  return { ...(await taskView(db, userId, id)), description: row.description };
}

// --- Lookups ---------------------------------------------------------------------------------

async function ownedTask(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .for('update');
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('task');
  return row;
}

async function projectColumns(conn: Conn, projectId: string) {
  return conn
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.projectId, projectId))
    .orderBy(asc(boardColumns.sortOrder));
}

async function assertGoal(conn: Conn, userId: string, goalId: string, projectId: string | null) {
  if (!projectId)
    throw invalid('invalid_goal', 'Inbox tasks can’t have a goal. Give the task a project first.');
  const [goal] = await conn
    .select({ projectId: goals.projectId })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)));
  if (!goal) throw notFound('goal');
  if (goal.projectId !== projectId) {
    throw invalid('invalid_goal', 'That goal belongs to another project.');
  }
}

/** Where a task of this project lands: the done column when it's done, else the first open one. */
function landingColumn(columns: ColumnRow[], done: boolean) {
  const column = done ? firstColumnOf(columns, 'done') : firstOpenColumn(columns);
  if (!column) throw conflict('board_broken', 'This project’s board has no column for that.');
  return column;
}

const inColumn = (columnId: string) =>
  and(eq(tasks.columnId, columnId), isNull(tasks.deletedAt), isNull(tasks.parentTaskId));

// --- Writing ---------------------------------------------------------------------------------

export async function createTask(userId: string, input: TaskCreate) {
  return db.transaction(async (tx) => {
    const position = input.position ?? 'bottom';
    let projectId = input.projectId ?? null;
    let columnId: string | null = null;
    let completedAt: Date | null = null;
    let scope: SQL | undefined;

    if (input.parentTaskId) {
      const parent = await ownedTask(tx, userId, input.parentTaskId);
      if (parent.parentTaskId) {
        throw invalid('invalid_parent', 'Subtasks can’t have subtasks of their own.');
      }
      if (input.projectId !== undefined && input.projectId !== parent.projectId) {
        throw invalid('invalid_parent', 'A subtask is always in its parent’s project.');
      }
      if (input.columnId) throw invalid('invalid_column', 'Subtasks aren’t on the board.');
      projectId = parent.projectId;
      scope = and(eq(tasks.parentTaskId, parent.id), isNull(tasks.deletedAt));
    } else if (projectId) {
      await ownedProject(tx, userId, projectId);
      const columns = await projectColumns(tx, projectId);
      const column = input.columnId
        ? columns.find((c) => c.id === input.columnId)
        : landingColumn(columns, false);
      if (!column) throw invalid('invalid_column', 'That column isn’t on this project’s board.');
      columnId = column.id;
      if (column.category === 'done') completedAt = new Date();
      scope = inColumn(column.id);
    } else {
      if (input.columnId) throw invalid('invalid_column', 'Inbox tasks aren’t on a board.');
      scope = and(isNull(tasks.projectId), isNull(tasks.deletedAt), isNull(tasks.parentTaskId));
    }
    if (input.goalId) await assertGoal(tx, userId, input.goalId, projectId);

    const id = newId('task');
    await tx.insert(tasks).values({
      id,
      userId,
      projectId,
      parentTaskId: input.parentTaskId ?? null,
      columnId,
      goalId: input.goalId ?? null,
      title: input.title,
      effort: input.effort ?? null,
      dueDate: input.dueDate ?? null,
      scheduledDate: input.scheduledDate ?? null,
      completedAt,
      sortOrder: await edgeOrder(tx, tasks, and(eq(tasks.userId, userId), scope), position),
      ...richColumns(input.description),
    });
    await writeLinks(tx, userId, id, input.description);
    const row = {
      id,
      effort: input.effort ?? null,
      projectId,
      parentTaskId: input.parentTaskId ?? null,
    };
    await recordActivity(tx, userId, [
      {
        type: 'item_created',
        entityId: id,
        payload: {
          kind: input.parentTaskId ? 'subtask' : 'task',
          projectId,
          parentTaskId: input.parentTaskId ?? null,
        },
      },
      ...(completedAt ? [donenessActivity(row, true)] : []),
    ]);
    // A new subtask or task under a goal fills in its parent's details (follow-up quests).
    touch(userId, input.parentTaskId, input.goalId);
    return taskView(tx, userId, id);
  });
}

export async function updateTask(userId: string, id: string, patch: TaskPatch) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id);
    const { description, projectId, goalId, ...rest } = patch;
    const values: Partial<TaskRow> = defined({ ...rest, ...richColumns(description) });

    const moving = projectId !== undefined && projectId !== task.projectId;
    if (moving) {
      if (task.parentTaskId) {
        throw invalid(
          'invalid_project',
          'Subtasks stay with their parent. Move the parent instead.',
        );
      }
      Object.assign(values, await placeInProject(tx, userId, task, projectId));
      // Its subtasks come along; goals are per project, so theirs are dropped.
      await tx.update(tasks).set({ projectId, goalId: null }).where(eq(tasks.parentTaskId, id));
      await unpinIfPinned(tx, task);
    }

    const targetProject = moving ? projectId : task.projectId;
    if (goalId !== undefined) {
      if (goalId) await assertGoal(tx, userId, goalId, targetProject);
      values.goalId = goalId;
    } else if (moving && task.goalId) {
      values.goalId = null;
    }

    if (Object.keys(values).length) await tx.update(tasks).set(values).where(eq(tasks.id, id));
    await writeLinks(tx, userId, id, description);
    if (moving && task.projectId === null && projectId && !task.parentTaskId) {
      await recordActivity(tx, userId, {
        type: 'task_triaged',
        entityId: id,
        payload: { projectId },
      });
    }
    touch(userId, id, values.goalId);
    return taskView(tx, userId, id);
  });
}

/** Column and order for a task moving into a project (at the top of where it lands). */
async function placeInProject(tx: Tx, userId: string, task: TaskRow, projectId: string | null) {
  if (!projectId) {
    const scope = and(
      eq(tasks.userId, userId),
      isNull(tasks.projectId),
      isNull(tasks.deletedAt),
      isNull(tasks.parentTaskId),
    );
    return { projectId: null, columnId: null, sortOrder: await edgeOrder(tx, tasks, scope, 'top') };
  }
  await ownedProject(tx, userId, projectId);
  const column = landingColumn(await projectColumns(tx, projectId), task.completedAt !== null);
  return {
    projectId,
    columnId: column.id,
    sortOrder: await edgeOrder(tx, tasks, inColumn(column.id), 'top'),
  };
}

/** Clear the old project's pin on a task that leaves it. */
async function unpinIfPinned(tx: Tx, task: TaskRow) {
  if (!task.projectId) return;
  await tx.execute(
    sql`update projects set next_action_task_id = null where id = ${task.projectId} and next_action_task_id = ${task.id}`,
  );
}

export async function completeTask(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id);
    if (task.completedAt) return taskView(tx, userId, id);
    const values: Partial<TaskRow> = { completedAt: new Date() };
    if (task.projectId && !task.parentTaskId) {
      const columns = await projectColumns(tx, task.projectId);
      const current = columns.find((c) => c.id === task.columnId);
      if (current?.category !== 'done') {
        const done = landingColumn(columns, true);
        values.columnId = done.id;
        values.sortOrder = await edgeOrder(tx, tasks, inColumn(done.id), 'top');
      }
    }
    await tx.update(tasks).set(values).where(eq(tasks.id, id));
    await unpinClosed(tx, [task.projectId]);
    await recordActivity(tx, userId, donenessActivity(task, true));
    return taskView(tx, userId, id);
  });
}

export async function reopenTask(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id);
    if (!task.completedAt) return taskView(tx, userId, id);
    const values: Partial<TaskRow> = { completedAt: null };
    if (task.projectId && !task.parentTaskId) {
      const columns = await projectColumns(tx, task.projectId);
      const current = columns.find((c) => c.id === task.columnId);
      if (!current || current.category === 'done') {
        const open = landingColumn(columns, false);
        values.columnId = open.id;
        values.sortOrder = await edgeOrder(tx, tasks, inColumn(open.id), 'top');
      }
    }
    await tx.update(tasks).set(values).where(eq(tasks.id, id));
    await recordActivity(tx, userId, donenessActivity(task, false));
    return taskView(tx, userId, id);
  });
}

/** Drag and drop on a board: into `columnId` at `index` (among that column's tasks). */
export async function moveTask(userId: string, id: string, move: TaskMove) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id);
    if (!task.projectId || task.parentTaskId) {
      throw invalid('invalid_move', 'Only a project’s top-level tasks are on its board.');
    }
    const columns = await projectColumns(tx, task.projectId);
    const column = columns.find((c) => c.id === move.columnId);
    if (!column) throw invalid('invalid_column', 'That column isn’t on this task’s board.');

    const siblings = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inColumn(column.id), ne(tasks.id, id)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
    const order = placeAt(
      siblings.map((t) => t.id),
      id,
      move.index,
    );

    const done = column.category === 'done';
    await tx
      .update(tasks)
      .set({
        columnId: column.id,
        completedAt: done ? (task.completedAt ?? new Date()) : null,
      })
      .where(eq(tasks.id, id));
    await writeOrder(tx, tasks, userId, order);
    if (done) await unpinClosed(tx, [task.projectId]);
    if (done !== (task.completedAt !== null)) {
      await recordActivity(tx, userId, donenessActivity(task, done));
    }
    return taskView(tx, userId, id);
  });
}

/** Soft delete, with its subtasks; undoable for 30 days. */
export async function deleteTask(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id);
    const deletedAt = new Date();
    await tx
      .update(tasks)
      .set({ deletedAt })
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          sql`(${tasks.id} = ${id} or ${tasks.parentTaskId} = ${id})`,
        ),
      );
    await unpinClosed(tx, [task.projectId]);
    touch(userId, id, task.parentTaskId, task.goalId);
    return { id, deletedAt };
  });
}

/** Undo a delete: the task and the subtasks deleted with it. */
export async function restoreTask(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const task = await ownedTask(tx, userId, id, { deleted: true });
    if (task.parentTaskId) {
      const [parent] = await tx
        .select({ deletedAt: tasks.deletedAt })
        .from(tasks)
        .where(eq(tasks.id, task.parentTaskId));
      if (parent?.deletedAt) {
        throw conflict('parent_deleted', 'Its parent task is deleted. Restore that first.');
      }
    }
    const values: Partial<TaskRow> = { deletedAt: null };
    // Its column may have been deleted meanwhile.
    if (task.projectId && !task.parentTaskId && !task.columnId) {
      const column = landingColumn(await projectColumns(tx, task.projectId), !!task.completedAt);
      values.columnId = column.id;
      values.sortOrder = await edgeOrder(tx, tasks, inColumn(column.id), 'top');
    }
    await tx.update(tasks).set(values).where(eq(tasks.id, id));
    await tx
      .update(tasks)
      .set({ deletedAt: null })
      .where(and(eq(tasks.parentTaskId, id), eq(tasks.deletedAt, task.deletedAt!)));
    return taskView(tx, userId, id);
  });
}

// --- Board columns ---------------------------------------------------------------------------

/** Move a column's tasks to the bottom of another column, matching its done-ness. */
export async function moveColumnTasks(tx: Tx, userId: string, from: string, to: ColumnRow) {
  const moving = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.columnId, from), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.sortOrder));
  if (!moving.length) return;
  const staying = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inColumn(to.id)))
    .orderBy(asc(tasks.sortOrder));
  const ids = moving.map((t) => t.id);
  await setDoneness(tx, userId, ids, to.category === 'done');
  await tx.update(tasks).set({ columnId: to.id }).where(inArray(tasks.id, ids));
  await writeOrder(tx, tasks, userId, [...staying.map((t) => t.id), ...ids]);
}

/** Complete (keeping earlier completion times) or reopen these tasks, logging each change. */
export async function setDoneness(tx: Tx, userId: string, ids: string[], done: boolean) {
  if (!ids.length) return;
  const changing = await tx
    .select({
      id: tasks.id,
      effort: tasks.effort,
      projectId: tasks.projectId,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.id, ids),
        isNull(tasks.deletedAt),
        done ? isNull(tasks.completedAt) : isNotNull(tasks.completedAt),
      ),
    );
  await recordActivity(
    tx,
    userId,
    changing.map((t) => donenessActivity(t, done)),
  );
  await tx
    .update(tasks)
    .set({ completedAt: done ? sql`coalesce(${tasks.completedAt}, now())` : null })
    .where(inArray(tasks.id, ids));
}
