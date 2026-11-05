// Snapshots: deleting a project or an area first stores everything that goes with it as JSON, so
// it can be restored from Settings for 30 days (plan.md §6). Restoring puts the rows back with
// their ids, so mentions of them work again, and rebuilds the links their own descriptions make
// (the purge job drops links whose source is gone).

import { newId } from '@strekatron/shared/ids';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { areas, boardColumns, goals, projects, snapshots, tasks } from '../db/schema';
import { conflict, edgeOrder, notFound, restoreDeadline, type Tx } from './common';
import { writeLinks } from './links';
import { hasRoomForActive } from './projects';

type AreaRow = typeof areas.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

interface ProjectBundle {
  project: ProjectRow;
  columns: (typeof boardColumns.$inferSelect)[];
  goals: (typeof goals.$inferSelect)[];
  tasks: (typeof tasks.$inferSelect)[];
}

interface SnapshotData {
  version: 1;
  area?: AreaRow;
  /** An area's projects that were kept (moved out of it); restoring moves them back. */
  keptProjectIds?: string[];
  projects: ProjectBundle[];
}

async function bundle(tx: Tx, projectId: string): Promise<ProjectBundle> {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw notFound('project');
  const columnRows = await tx
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.projectId, projectId));
  const goalRows = await tx.select().from(goals).where(eq(goals.projectId, projectId));
  const taskRows = await tx.select().from(tasks).where(eq(tasks.projectId, projectId));
  return { project, columns: columnRows, goals: goalRows, tasks: taskRows };
}

/** Store a snapshot of projects (and an area) before they're deleted. Returns its id. */
export async function snapshotProjects(
  tx: Tx,
  userId: string,
  kind: 'project' | 'area',
  entityId: string,
  title: string,
  what: { projects: string[]; area?: AreaRow; keptProjectIds?: string[] },
) {
  const data: SnapshotData = {
    version: 1,
    area: what.area,
    keptProjectIds: what.keptProjectIds,
    projects: [],
  };
  for (const id of what.projects) data.projects.push(await bundle(tx, id));
  const id = newId('snapshot');
  await tx.insert(snapshots).values({
    id,
    userId,
    kind,
    entityId,
    title,
    data,
    expiresAt: restoreDeadline(),
  });
  return id;
}

export async function listSnapshots(userId: string) {
  const rows = await db
    .select({
      id: snapshots.id,
      kind: snapshots.kind,
      entityId: snapshots.entityId,
      title: snapshots.title,
      createdAt: snapshots.createdAt,
      expiresAt: snapshots.expiresAt,
      projects: sql<number>`jsonb_array_length(${snapshots.data}->'projects')::int`,
      tasks: sql<number>`(select coalesce(sum(jsonb_array_length(p->'tasks')), 0)::int from jsonb_array_elements(${snapshots.data}->'projects') p)`,
    })
    .from(snapshots)
    .where(and(eq(snapshots.userId, userId), gt(snapshots.expiresAt, new Date())))
    .orderBy(desc(snapshots.createdAt));
  return rows;
}

// JSON turned the timestamps into strings; the `…At` columns are timestamps again.
function revive<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (k.endsWith('At') && typeof v === 'string') out[k] = new Date(v);
  }
  return out as T;
}

/** Put a snapshot's rows back. Active projects over the limit come back parked. */
export async function restoreSnapshot(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [snap] = await tx
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.id, id),
          eq(snapshots.userId, userId),
          gt(snapshots.expiresAt, new Date()),
        ),
      )
      .for('update');
    if (!snap) throw notFound('deleted item');
    const data = snap.data as SnapshotData;

    const projectIds = data.projects.map((b) => b.project.id);
    const ids = [...projectIds, ...(data.area ? [data.area.id] : [])];
    const [existsProject] = projectIds.length
      ? await tx.select({ id: projects.id }).from(projects).where(inArray(projects.id, projectIds))
      : [];
    const [existsArea] = data.area
      ? await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, data.area.id))
      : [];
    if (existsProject || existsArea) {
      throw conflict('already_restored', `“${snap.title}” is already back.`, { ids });
    }

    if (data.area) {
      const sortOrder = await edgeOrder(tx, areas, eq(areas.userId, userId), 'bottom');
      await tx.insert(areas).values({ ...revive(data.area), userId, sortOrder });
      if (data.keptProjectIds?.length) {
        await tx
          .update(projects)
          .set({ areaId: data.area.id })
          .where(
            and(
              eq(projects.userId, userId),
              inArray(projects.id, data.keptProjectIds),
              isNull(projects.areaId),
            ),
          );
      }
    }

    const parked: string[] = [];
    for (const b of data.projects) {
      const project = revive(b.project);
      let areaId = project.areaId;
      if (areaId && areaId !== data.area?.id) {
        const [area] = await tx
          .select({ id: areas.id })
          .from(areas)
          .where(and(eq(areas.id, areaId), eq(areas.userId, userId)));
        if (!area) areaId = null;
      }
      let status = project.status;
      if (status === 'active' && !(await hasRoomForActive(tx, userId))) {
        status = 'parked';
        parked.push(project.title);
      }
      await tx
        .insert(projects)
        .values({ ...project, userId, areaId, status, nextActionTaskId: null });
      if (b.columns.length) {
        await tx.insert(boardColumns).values(b.columns.map((c) => ({ ...revive(c), userId })));
      }
      if (b.goals.length) {
        await tx.insert(goals).values(b.goals.map((g) => ({ ...revive(g), userId })));
      }
      // Parents before their subtasks.
      const ordered = [...b.tasks].sort(
        (x, y) => Number(x.parentTaskId !== null) - Number(y.parentTaskId !== null),
      );
      if (ordered.length) {
        await tx.insert(tasks).values(ordered.map((t) => ({ ...revive(t), userId })));
      }
      if (project.nextActionTaskId) {
        await tx
          .update(projects)
          .set({ nextActionTaskId: project.nextActionTaskId })
          .where(eq(projects.id, project.id));
      }
    }

    const sources = [
      ...(data.area ? [data.area] : []),
      ...data.projects.flatMap((b) => [b.project, ...b.goals, ...b.tasks]),
    ];
    for (const row of sources) {
      if (row.description) await writeLinks(tx, userId, row.id, row.description);
    }

    await tx.delete(snapshots).where(eq(snapshots.id, id));
    return { kind: snap.kind, entityId: snap.entityId, title: snap.title, parked };
  });
}

/** Snapshots past their 30 days. */
export async function purgeExpiredSnapshots() {
  const gone = await db
    .delete(snapshots)
    .where(sql`${snapshots.expiresAt} <= now()`)
    .returning({ id: snapshots.id });
  return gone.length;
}
