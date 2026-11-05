// Areas: long-lived spheres of life holding projects. Ordered by hand; deleting one keeps a
// snapshot, and its projects are either moved out of it or deleted with it.

import type { AreaCreate, AreaPatch } from '@streaktron/shared/schemas';
import { newId } from '@streaktron/shared/ids';
import { checkedOrder } from '@streaktron/shared/structure';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { areas, projects } from '../db/schema';
import {
  conflict,
  defined,
  edgeOrder,
  notFound,
  richColumns,
  writeOrder,
  type Conn,
} from './common';
import { recordActivity } from './activity';
import { writeLinks } from './links';
import { snapshotProjects } from './snapshots';

const view = ({ userId: _, ...a }: typeof areas.$inferSelect) => a;

export async function listAreas(userId: string) {
  const rows = await db
    .select()
    .from(areas)
    .where(eq(areas.userId, userId))
    .orderBy(asc(areas.sortOrder), asc(areas.createdAt));
  return rows.map(view);
}

async function ownedArea(conn: Conn, userId: string, id: string) {
  const [row] = await conn
    .select()
    .from(areas)
    .where(and(eq(areas.id, id), eq(areas.userId, userId)));
  if (!row) throw notFound('area');
  return row;
}

export async function createArea(userId: string, input: AreaCreate) {
  return db.transaction(async (tx) => {
    const sortOrder = await edgeOrder(tx, areas, eq(areas.userId, userId), 'bottom');
    const id = newId('area');
    const [row] = await tx
      .insert(areas)
      .values({
        id,
        userId,
        title: input.title,
        color: input.color,
        icon: input.icon,
        sortOrder,
        ...richColumns(input.description),
      })
      .returning();
    await writeLinks(tx, userId, id, input.description);
    await recordActivity(tx, userId, {
      type: 'item_created',
      entityId: id,
      payload: { kind: 'area', projectId: null, parentTaskId: null },
    });
    return view(row!);
  });
}

export async function updateArea(userId: string, id: string, patch: AreaPatch) {
  return db.transaction(async (tx) => {
    const area = await ownedArea(tx, userId, id);
    const { archived, description, ...rest } = patch;
    const values = defined({
      ...rest,
      ...richColumns(description),
      archivedAt:
        archived === undefined ? undefined : archived ? (area.archivedAt ?? new Date()) : null,
    });
    if (!Object.keys(values).length) return view(area);
    const [row] = await tx.update(areas).set(values).where(eq(areas.id, id)).returning();
    await writeLinks(tx, userId, id, description);
    return view(row!);
  });
}

export async function reorderAreas(userId: string, ids: string[]) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: areas.id })
      .from(areas)
      .where(eq(areas.userId, userId))
      .for('update');
    const order = checkedOrder(
      existing.map((a) => a.id),
      ids,
    );
    if (!order) throw conflict('order_changed', 'Your areas changed meanwhile. Try again.');
    await writeOrder(tx, areas, userId, order);
    const rows = await tx
      .select()
      .from(areas)
      .where(eq(areas.userId, userId))
      .orderBy(asc(areas.sortOrder));
    return rows.map(view);
  });
}

/**
 * Delete an area into a snapshot. Its projects are kept (moved to no area; restoring moves them
 * back) or deleted with it (restored with it).
 */
export async function deleteArea(userId: string, id: string, mode: 'keep' | 'delete') {
  return db.transaction(async (tx) => {
    const area = await ownedArea(tx, userId, id);
    const own = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.areaId, id)))
      .for('update');
    const ids = own.map((p) => p.id);
    const snapshotId = await snapshotProjects(tx, userId, 'area', area.id, area.title, {
      area,
      projects: mode === 'delete' ? ids : [],
      keptProjectIds: mode === 'keep' ? ids : [],
    });
    if (mode === 'delete') {
      for (const projectId of ids) await tx.delete(projects).where(eq(projects.id, projectId));
    }
    await tx.delete(areas).where(eq(areas.id, id)); // kept projects: area_id → null (FK)
    return { id, snapshotId, projectIds: ids, projects: mode };
  });
}
