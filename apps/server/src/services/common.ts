// Helpers every structure service uses: transactions, scoped lookups, ordering, rich text.

import { textFromDoc, type RichDoc } from '@strekatron/shared/rich';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { HttpError } from '../http/errors';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Conn = Db | Tx;

/** Deleted tasks and goals can be restored this long; snapshots of projects and areas too. */
export const RESTORE_DAYS = 30;
export const restoreDeadline = (from = new Date()) =>
  new Date(from.getTime() + RESTORE_DAYS * 86_400_000);

export const notFound = (what: string) =>
  new HttpError(404, 'not_found', `That ${what} doesn’t exist (it may have been deleted).`);

export const invalid = (code: string, message: string) => new HttpError(400, code, message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

/** The columns a rich-text input sets: the document and its text. Nothing when it's absent. */
export function richColumns(doc: RichDoc | null | undefined) {
  if (doc === undefined) return {};
  return { description: doc, descriptionText: textFromDoc(doc) };
}

/** Undefined keys removed, so a PATCH only touches what it names. */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

interface Ordered {
  id: PgColumn;
  userId: PgColumn;
  sortOrder: PgColumn;
}

/** Rewrite `sort_order` so the rows are in the order of `ids` (0, 1, 2…). */
export async function writeOrder(
  conn: Conn,
  table: PgTable & Ordered,
  userId: string,
  ids: readonly string[],
) {
  if (ids.length === 0) return;
  const cases = sql.join(
    ids.map((id, i) => sql`when ${id} then ${i}::int`),
    sql` `,
  );
  // One statement for the whole list. The generic table loses Drizzle's column typing here.
  await (conn as Db)
    .update(table as typeof table & PgTable)
    .set({ sortOrder: sql`(case ${table.id} ${cases} end)` } as never)
    .where(and(eq(table.userId, userId), inArray(table.id, ids as string[])));
}

/** The sort order that puts a new row first (`top`) or last (`bottom`) among `where`. */
export async function edgeOrder(
  conn: Conn,
  table: PgTable & Ordered,
  where: SQL | undefined,
  position: 'top' | 'bottom',
): Promise<number> {
  const fn = position === 'top' ? sql`min` : sql`max`;
  const rows = await (conn as Db)
    .select({ edge: sql<number | null>`${fn}(${table.sortOrder})` })
    .from(table)
    .where(where);
  const edge = rows[0]?.edge;
  if (edge == null) return 0;
  return position === 'top' ? edge - 1 : edge + 1;
}
