import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { tasks } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
});

/** An export without the moment it was made, to compare two of them. */
const comparable = (f: { exportedAt: string; data: Record<string, unknown[]> }) => {
  const { exportedAt: _, ...rest } = f;
  return rest;
};

async function someData() {
  const area = (await as.post('/api/areas', { title: 'University' })).body;
  const p = (await as.post('/api/projects', { title: 'Thesis', areaId: area.id })).body;
  const parent = (await as.post('/api/tasks', { title: 'Write intro', projectId: p.id })).body;
  await as.post('/api/tasks', { title: 'Outline', projectId: p.id, parentTaskId: parent.id });
  await as.post(`/api/tasks/${parent.id}/complete`);
  await as.post('/api/habits', { title: 'Read 20 pages' });
  await as.get('/api/quests');
  return { p, parent };
}

describe('export and import (D51)', () => {
  it('exports everything, and an import of it brings back the same account', async () => {
    const { p } = await someData();
    const res = await as.get('/api/data/export');
    expect(res.status).toBe(200);
    const file = res.body;
    expect(file).toMatchObject({ format: 'strekatron-export', version: 1 });
    expect(file.data.projects).toHaveLength(1);
    expect(file.data.tasks).toHaveLength(2);
    expect(file.data.activity.length).toBeGreaterThan(0);
    expect(JSON.stringify(file)).not.toContain('userId');

    // Change things, then put the file back.
    await as.del(`/api/projects/${p.id}`);
    await as.post('/api/tasks', { title: 'Made after the export' });
    const imp = await as.post('/api/data/import', file);
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    expect(imp.body.imported).toMatchObject({ projects: 1, tasks: 2 });
    expect(existsSync(imp.body.backup)).toBe(true);

    const again = (await as.get('/api/data/export')).body;
    expect(comparable(again)).toEqual(comparable(file));
    // The subtask's parent came back (filled in after every task was in).
    const sub = await db.select().from(tasks).where(eq(tasks.title, 'Outline'));
    expect(sub[0]?.parentTaskId).toBeTruthy();
    expect((await as.get(`/api/projects/${p.id}`)).status).toBe(200);
  });

  it('refuses a file it can’t read, changing nothing', async () => {
    await someData();
    const before = (await as.get('/api/data/export')).body;
    expect((await as.post('/api/data/import', { ...before, format: 'other' })).status).toBe(400);
    const broken = { ...before, data: { ...before.data, tasks: [{ id: 'tsk_x', title: null }] } };
    const res = await as.post('/api/data/import', broken);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_file');
    expect(comparable((await as.get('/api/data/export')).body)).toEqual(comparable(before));
  });
});
