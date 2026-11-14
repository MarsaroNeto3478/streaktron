// Export and import (D51): an account's data as one JSON file, and that file put back. Import
// replaces everything the account has (it's a restore, not a merge), in one transaction, with the
// file's ids; a copy of what was there is written to DATA_DIR/exports first. Sign-in data (sessions,
// password), push subscriptions (they belong to devices) and settings history stay out.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, getTableColumns, sql, type Table } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import {
  achievements,
  activity,
  areas,
  boardColumns,
  calendarEvents,
  focusSessions,
  goals,
  habitCheckins,
  habits,
  inventoryItems,
  links,
  lootBoxes,
  projects,
  quests,
  snapshots,
  tasks,
  userSettings,
  users,
  weeklyReviews,
} from '../db/schema';
import { env } from '../env';
import { HttpError } from '../http/errors';
import { notFound, type Tx } from './common';

export const EXPORT_FORMAT = 'strekatron-export';
export const EXPORT_VERSION = 1;

/**
 * Every table that holds an account's data, in an order that inserts parents first. `later`:
 * columns that point forward or at the same table, filled in once every row is in.
 */
const TABLES: { key: string; table: PgTable; later?: string[] }[] = [
  { key: 'areas', table: areas },
  { key: 'projects', table: projects, later: ['nextActionTaskId'] },
  { key: 'boardColumns', table: boardColumns },
  { key: 'goals', table: goals },
  { key: 'tasks', table: tasks, later: ['parentTaskId'] },
  { key: 'habits', table: habits },
  { key: 'habitCheckins', table: habitCheckins },
  { key: 'calendarEvents', table: calendarEvents },
  { key: 'weeklyReviews', table: weeklyReviews },
  { key: 'focusSessions', table: focusSessions },
  { key: 'activity', table: activity },
  { key: 'quests', table: quests, later: ['parentQuestId', 'rerollOf'] },
  { key: 'lootBoxes', table: lootBoxes },
  { key: 'inventoryItems', table: inventoryItems },
  { key: 'achievements', table: achievements },
  { key: 'links', table: links },
  { key: 'snapshots', table: snapshots },
];

type Row = Record<string, unknown>;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  user: { name: string; email: string };
  settings: Row;
  data: Record<string, Row[]>;
}

const userCol = (t: PgTable) => (getTableColumns(t) as Record<string, never>).userId!;
const idCol = (t: PgTable) => (getTableColumns(t) as Record<string, never>).id!;

/** Everything the account has, as one JSON-able object (user ids left out). */
export async function exportAccount(userId: string): Promise<ExportFile> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!u || !s) throw notFound('user');
  const data: Record<string, Row[]> = {};
  for (const { key, table } of TABLES) {
    const rows = (await db
      .select()
      .from(table as Table)
      .where(eq(userCol(table), userId))
      .orderBy(idCol(table))) as Row[];
    data[key] = rows.map(({ userId: _, ...r }) => r);
  }
  const { userId: _, ...settings } = s;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user: { name: u.name, email: u.email },
    settings,
    data,
  };
}

/** A file's rows as the table takes them: known columns only, timestamps back to dates. */
function toRow(table: PgTable, r: Row, userId: string): Row {
  const out: Row = {};
  for (const [name, col] of Object.entries(getTableColumns(table))) {
    if (name === 'userId') continue;
    if (!(name in r)) continue; // a column newer than the file: its default
    const v = r[name];
    out[name] = col.columnType === 'PgTimestamp' && typeof v === 'string' ? new Date(v) : v;
  }
  out.userId = userId;
  return out;
}

const CHUNK = 500;

/** How many rows of each kind a file has (shown before importing). */
export const counts = (f: Pick<ExportFile, 'data'>) =>
  Object.fromEntries(TABLES.map(({ key }) => [key, f.data[key]?.length ?? 0]));

/**
 * Replace the account's data with a file's. Fails as a whole (nothing changes) when the file is
 * malformed or its ids belong to another account on this server.
 */
export async function importAccount(userId: string, file: ExportFile) {
  if (file.format !== EXPORT_FORMAT || file.version !== EXPORT_VERSION) {
    throw new HttpError(400, 'bad_file', 'This isn’t a Strekatron export this version can read.');
  }
  // A copy of what's there now, in case the file was the wrong one.
  const dir = join(env.DATA_DIR, 'exports');
  await mkdir(dir, { recursive: true });
  const backup = join(dir, `before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(backup, JSON.stringify(await exportAccount(userId)));

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from user_settings where user_id = ${userId} for update`);
      for (const { table } of [...TABLES].reverse()) {
        await tx.delete(table).where(eq(userCol(table), userId));
      }
      for (const { key, table, later } of TABLES) {
        const rows = (file.data[key] ?? []).map((r) => toRow(table, r, userId));
        const first = rows.map((r) => {
          const copy = { ...r };
          for (const c of later ?? []) copy[c] = null;
          return copy;
        });
        for (let i = 0; i < first.length; i += CHUNK) {
          await tx.insert(table).values(first.slice(i, i + CHUNK) as never);
        }
        if (later) await fillLater(tx, table, rows, later);
      }
      const settings = toRow(userSettings, file.settings ?? {}, userId);
      delete settings.userId;
      if (Object.keys(settings).length) {
        await tx.update(userSettings).set(settings).where(eq(userSettings.userId, userId));
      }
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code =
      (e as { code?: string; cause?: { code?: string } }).cause?.code ??
      (e as { code?: string }).code;
    if (code === '23505') {
      throw new HttpError(
        409,
        'ids_taken',
        'Some of this file’s data belongs to another account here.',
      );
    }
    if (code?.startsWith('23') || code?.startsWith('22')) {
      throw new HttpError(
        400,
        'bad_file',
        'This file doesn’t fit: some of its data is broken or missing.',
      );
    }
    throw e;
  }
  return { imported: counts(file), backup };
}

/** Set the columns held back on the first pass. */
async function fillLater(tx: Tx, table: PgTable, rows: Row[], cols: string[]) {
  const columns = getTableColumns(table) as Record<string, never>;
  for (const r of rows) {
    const set = Object.fromEntries(cols.filter((c) => r[c] != null).map((c) => [c, r[c]]));
    if (!Object.keys(set).length) continue;
    // Keep the file's time: this second pass isn't an edit.
    if ('updatedAt' in columns && r.updatedAt) set.updatedAt = r.updatedAt;
    await tx
      .update(table)
      .set(set)
      .where(and(eq(columns.id!, r.id as string), eq(columns.userId!, r.userId as string)));
  }
}
