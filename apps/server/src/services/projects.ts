// Projects: lifecycle with the hard active-project limit (D5), next actions, deletion into a
// snapshot.

import type {
  ProjectCreate,
  ProjectMove,
  ProjectPatch,
  ProjectStatusInput,
} from '@streaktron/shared/schemas';
import { newId } from '@streaktron/shared/ids';
import {
  canTransition,
  DEFAULT_COLUMNS,
  pickNextAction,
  placeAt,
  type ProjectStatus,
} from '@streaktron/shared/structure';
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { areas, boardColumns, projects, tasks, userSettings } from '../db/schema';
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
import { recordActivity } from './activity';
import { writeLinks } from './links';
import { snapshotProjects } from './snapshots';

type ProjectRow = typeof projects.$inferSelect;

export interface NextAction {
  id: string;
  title: string;
  /** Pinned by the user, rather than picked from the board. */
  pinned: boolean;
}

/** A project as the API returns it: the row, task counts and its next action. */
export async function projectViews(conn: Conn, userId: string, only?: string[]) {
  const scope = (
    col: typeof projects.id | typeof tasks.projectId | typeof boardColumns.projectId,
  ) => (only ? inArray(col, only) : undefined);

  // One query at a time: inside a transaction they share one connection.
  const rows = await conn
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), scope(projects.id)))
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt));
  const columns = await conn
    .select({
      id: boardColumns.id,
      projectId: boardColumns.projectId,
      category: boardColumns.category,
      sortOrder: boardColumns.sortOrder,
    })
    .from(boardColumns)
    .where(and(eq(boardColumns.userId, userId), scope(boardColumns.projectId)));
  const openTasks = await conn
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      columnId: tasks.columnId,
      sortOrder: tasks.sortOrder,
      completedAt: tasks.completedAt,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.projectId),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        scope(tasks.projectId),
      ),
    );
  const counts = await conn
    .select({
      projectId: tasks.projectId,
      open: sql<number>`count(*) filter (where ${tasks.completedAt} is null)::int`,
      done: sql<number>`count(*) filter (where ${tasks.completedAt} is not null)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.projectId),
        scope(tasks.projectId),
      ),
    )
    .groupBy(tasks.projectId);

  const countsBy = new Map(counts.map((c) => [c.projectId, c]));
  return rows.map(({ userId: _, ...p }) => {
    const ownTasks = openTasks.filter((t) => t.projectId === p.id);
    const nextId = pickNextAction(
      p.nextActionTaskId,
      columns.filter((c) => c.projectId === p.id),
      ownTasks,
    );
    const next = ownTasks.find((t) => t.id === nextId);
    const c = countsBy.get(p.id);
    return {
      ...p,
      counts: { open: c?.open ?? 0, done: c?.done ?? 0 },
      nextAction: next
        ? ({ id: next.id, title: next.title, pinned: next.id === p.nextActionTaskId } as NextAction)
        : null,
    };
  });
}
export type ProjectView = Awaited<ReturnType<typeof projectViews>>[number];

export async function projectView(conn: Conn, userId: string, id: string) {
  const [view] = await projectViews(conn, userId, [id]);
  if (!view) throw notFound('project');
  return view;
}

/** A project row of this user, locked for the rest of the transaction when `lock` is set. */
export async function ownedProject(conn: Conn, userId: string, id: string, lock = false) {
  const q = conn
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw notFound('project');
  return row;
}

async function assertArea(conn: Conn, userId: string, areaId: string | null | undefined) {
  if (!areaId) return;
  const [row] = await conn
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId)));
  if (!row) throw notFound('area');
}

/**
 * Lock the user's settings row, so two requests can't both take the last active slot, and return
 * the active-project limit.
 */
async function lockLimit(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ limit: userSettings.activeProjectLimit })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .for('update');
  return row?.limit ?? 3;
}

async function activeProjects(conn: Conn, userId: string, except?: string) {
  return conn
    .select({ id: projects.id, title: projects.title, color: projects.color, icon: projects.icon })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.status, 'active'),
        except ? ne(projects.id, except) : undefined,
      ),
    )
    .orderBy(asc(projects.statusChangedAt));
}

/** 409 `active_limit` when another project can't be active; details list the active ones. */
async function assertRoomForActive(tx: Tx, userId: string, except?: string) {
  const limit = await lockLimit(tx, userId);
  const active = await activeProjects(tx, userId, except);
  if (active.length >= limit) {
    throw conflict(
      'active_limit',
      `You already have ${active.length} active project${active.length === 1 ? '' : 's'} (your limit is ${limit}). Park one to continue.`,
      { limit, active },
    );
  }
}

/** Whether one more project could be active now (used by restore, which parks instead). */
export async function hasRoomForActive(tx: Tx, userId: string) {
  const limit = await lockLimit(tx, userId);
  const [row] = await tx
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
  return (row?.n ?? 0) < limit;
}

export async function createProject(userId: string, input: ProjectCreate) {
  return db.transaction(async (tx) => {
    await assertArea(tx, userId, input.areaId);
    const status = input.status ?? 'active';
    if (status === 'active') await assertRoomForActive(tx, userId);

    const id = newId('project');
    const sortOrder = await edgeOrder(
      tx,
      projects,
      and(
        eq(projects.userId, userId),
        input.areaId ? eq(projects.areaId, input.areaId) : isNull(projects.areaId),
      ),
      'bottom',
    );
    await tx.insert(projects).values({
      id,
      userId,
      title: input.title,
      areaId: input.areaId ?? null,
      status,
      color: input.color,
      icon: input.icon,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      sortOrder,
      ...richColumns(input.description),
    });
    await writeLinks(tx, userId, id, input.description);
    await tx.insert(boardColumns).values(
      DEFAULT_COLUMNS.map((c, i) => ({
        id: newId('boardColumn'),
        userId,
        projectId: id,
        title: c.title,
        category: c.category,
        sortOrder: i,
      })),
    );
    await recordActivity(tx, userId, {
      type: 'item_created',
      entityId: id,
      payload: { kind: 'project', projectId: id, parentTaskId: null },
    });
    return projectView(tx, userId, id);
  });
}

export async function updateProject(userId: string, id: string, patch: ProjectPatch) {
  return db.transaction(async (tx) => {
    const project = await ownedProject(tx, userId, id, true);
    if (patch.areaId !== undefined) await assertArea(tx, userId, patch.areaId);
    if (patch.nextActionTaskId) {
      const [task] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, patch.nextActionTaskId),
            eq(tasks.userId, userId),
            eq(tasks.projectId, id),
            isNull(tasks.parentTaskId),
            isNull(tasks.completedAt),
            isNull(tasks.deletedAt),
          ),
        );
      if (!task) {
        throw invalid(
          'invalid_next_action',
          'The next action must be an open task of this project.',
        );
      }
    }

    const { description, areaId, ...rest } = patch;
    const values = defined({ ...rest, ...richColumns(description) });
    if (areaId !== undefined && areaId !== project.areaId) {
      // Moving to another area puts it last there.
      Object.assign(values, {
        areaId,
        sortOrder: await edgeOrder(
          tx,
          projects,
          and(
            eq(projects.userId, userId),
            areaId ? eq(projects.areaId, areaId) : isNull(projects.areaId),
          ),
          'bottom',
        ),
      });
    }
    if (Object.keys(values).length) {
      await tx.update(projects).set(values).where(eq(projects.id, id));
    }
    await writeLinks(tx, userId, id, description);
    if (patch.nextActionTaskId && patch.nextActionTaskId !== project.nextActionTaskId) {
      await recordActivity(tx, userId, {
        type: 'next_action_set',
        entityId: patch.nextActionTaskId,
        payload: { projectId: id },
      });
    }
    return projectView(tx, userId, id);
  });
}

/**
 * Drag and drop on the Projects page: into `areaId` (null: no area) at `index` among that area's
 * projects in progress (active and parked, as the page shows them). Completed and archived ones
 * keep their places after those. Returns every project of the area, in order.
 */
export async function moveProject(userId: string, id: string, move: ProjectMove) {
  return db.transaction(async (tx) => {
    const project = await ownedProject(tx, userId, id, true);
    if (project.status !== 'active' && project.status !== 'parked') {
      throw invalid('invalid_move', 'Only projects in progress can be dragged.');
    }
    await assertArea(tx, userId, move.areaId);
    const siblings = await tx
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          move.areaId ? eq(projects.areaId, move.areaId) : isNull(projects.areaId),
          ne(projects.id, id),
        ),
      )
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt));
    const inProgress = siblings.filter((p) => p.status === 'active' || p.status === 'parked');
    const closed = siblings.filter((p) => p.status !== 'active' && p.status !== 'parked');
    const order = [
      ...placeAt(
        inProgress.map((p) => p.id),
        id,
        move.index,
      ),
      ...closed.map((p) => p.id),
    ];
    if (move.areaId !== project.areaId) {
      await tx.update(projects).set({ areaId: move.areaId }).where(eq(projects.id, id));
    }
    await writeOrder(tx, projects, userId, order);
    return projectViews(tx, userId, order);
  });
}

/**
 * Change a project's status. Activating checks the active limit (D5); `park` names an active
 * project to park in the same step, which is how the "Park one to continue" dialog resolves.
 * Returns every project that changed.
 */
export async function setProjectStatus(userId: string, id: string, input: ProjectStatusInput) {
  return db.transaction(async (tx) => {
    const project = await ownedProject(tx, userId, id, true);
    const changed = [id];

    if (input.park) {
      if (input.park === id) throw invalid('invalid_park', 'A project can’t park itself.');
      const other = await ownedProject(tx, userId, input.park, true);
      if (other.status !== 'active') {
        throw conflict('invalid_park', `“${other.title}” isn’t active anymore.`);
      }
      await setStatus(tx, other.id, 'parked');
      changed.push(other.id);
    }

    if (project.status !== input.status) {
      if (!canTransition(project.status, input.status)) {
        throw conflict(
          'invalid_transition',
          input.status === 'active' && project.status === 'archived'
            ? 'Bring an archived project back as parked first.'
            : `A ${project.status} project can’t become ${input.status}.`,
        );
      }
      if (input.status === 'active') await assertRoomForActive(tx, userId, id);
      await setStatus(tx, id, input.status);
    }
    return projectViews(tx, userId, changed);
  });
}

const setStatus = (tx: Tx, id: string, status: ProjectStatus) =>
  tx.update(projects).set({ status, statusChangedAt: new Date() }).where(eq(projects.id, id));

/** Delete a project and everything in it, keeping a snapshot to restore it from. */
export async function deleteProject(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const project = await ownedProject(tx, userId, id, true);
    const snapshotId = await snapshotProjects(tx, userId, 'project', project.id, project.title, {
      projects: [project.id],
    });
    await tx.delete(projects).where(eq(projects.id, id));
    return { id, snapshotId };
  });
}

/** Unpin next actions that are done or deleted now (after completing or deleting tasks). */
export async function unpinClosed(conn: Conn, projectIds: (string | null)[]) {
  const ids = projectIds.filter((p): p is string => !!p);
  if (!ids.length) return;
  const closed = conn
    .select({ id: tasks.id })
    .from(tasks)
    .where(or(isNotNull(tasks.completedAt), isNotNull(tasks.deletedAt)));
  await conn
    .update(projects)
    .set({ nextActionTaskId: null })
    .where(and(inArray(projects.id, ids), inArray(projects.nextActionTaskId, closed)));
}

export type { ProjectRow };
