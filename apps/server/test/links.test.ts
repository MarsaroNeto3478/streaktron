import { newId } from '@strekatron/shared/ids';
import type { RichDoc, RichNode } from '@strekatron/shared/rich';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { goals, links, projects, snapshots, users } from '../src/db/schema';
import { runPurge } from '../src/jobs/purge';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
});

const mention = (id: string, label: string): RichNode => ({
  type: 'mention',
  attrs: { id, label },
});
/** A one-paragraph document: strings are text, [id, label] pairs are mentions. */
const doc = (...parts: (string | [string, string])[]): RichDoc => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: parts.map((p) =>
        typeof p === 'string' ? { type: 'text', text: p } : mention(...p),
      ),
    },
  ],
});

const created = async (path: string, body: Record<string, unknown>) => {
  const res = await as.post(path, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; title: string };
};

const backlinksOf = async (id: string) => {
  const res = await as.get(`/api/entities/${id}/backlinks`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.backlinks as { kind: string; id: string; title: string; snippet: string }[];
};

const resolve = async (...ids: string[]) => {
  const res = await as.get(`/api/entities/resolve?ids=${ids.join(',')}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.entities as { id: string; title: string; deleted: boolean; status: string }[];
};

describe('links and backlinks', () => {
  it('meets the phase 2 acceptance: mention, rename, backlinks, delete', async () => {
    const p = await created('/api/projects', { title: 'Calculus' });
    const g = await created('/api/goals', { projectId: p.id, title: 'Pass', kind: 'outcome' });
    const t = await created('/api/tasks', {
      title: 'Study limits',
      projectId: p.id,
      description: doc('Needed for ', [g.id, 'Pass'], ' in June'),
    });

    expect(await backlinksOf(g.id)).toMatchObject([
      { kind: 'task', id: t.id, title: 'Study limits', snippet: 'Needed for @Pass in June' },
    ]);

    await as.patch(`/api/goals/${g.id}`, { title: 'Pass the final exam' });
    expect(await resolve(g.id)).toMatchObject([
      { id: g.id, title: 'Pass the final exam', deleted: false, status: 'open' },
    ]);
    // The backlink's line reads with the new title too.
    expect(await backlinksOf(g.id)).toMatchObject([
      { id: t.id, snippet: 'Needed for @Pass the final exam in June' },
    ]);

    await as.del(`/api/goals/${g.id}`);
    expect(await resolve(g.id)).toMatchObject([{ id: g.id, deleted: true }]);
    await as.post(`/api/goals/${g.id}/restore`);
    expect(await resolve(g.id)).toMatchObject([{ id: g.id, deleted: false }]);
  });

  it('rewrites a source’s links on every save of its description', async () => {
    const a = await created('/api/tasks', { title: 'A' });
    const b = await created('/api/tasks', { title: 'B' });
    const c = await created('/api/tasks', {
      title: 'C',
      description: doc([a.id, 'A'], ' and ', [b.id, 'B'], ' and ', [a.id, 'A again']),
    });
    expect((await backlinksOf(a.id)).map((l) => l.id)).toEqual([c.id]);
    expect((await backlinksOf(b.id)).map((l) => l.id)).toEqual([c.id]);

    await as.patch(`/api/tasks/${c.id}`, { description: doc('only ', [b.id, 'B']) });
    expect(await backlinksOf(a.id)).toEqual([]);
    expect(await backlinksOf(b.id)).toMatchObject([{ id: c.id, snippet: 'only @B' }]);

    // A patch without the description leaves its links alone.
    await as.patch(`/api/tasks/${c.id}`, { title: 'C2' });
    expect(await backlinksOf(b.id)).toMatchObject([{ id: c.id, title: 'C2' }]);

    await as.patch(`/api/tasks/${c.id}`, { description: null });
    expect(await backlinksOf(b.id)).toEqual([]);
  });

  it('links from every kind of description, grouped tasks → goals → projects → areas', async () => {
    const target = await created('/api/tasks', { title: 'Target' });
    const d = doc('see ', [target.id, 'Target']);
    const area = await created('/api/areas', { title: 'Uni' });
    const p = await created('/api/projects', { title: 'P', description: d });
    const g = await created('/api/goals', {
      projectId: p.id,
      title: 'G',
      kind: 'outcome',
      description: d,
    });
    await as.patch(`/api/areas/${area.id}`, { description: d });
    const t = await created('/api/tasks', { title: 'T', description: d });
    expect((await backlinksOf(target.id)).map((l) => [l.kind, l.id])).toEqual([
      ['task', t.id],
      ['goal', g.id],
      ['project', p.id],
      ['area', area.id],
    ]);
  });

  it('ignores self-mentions and hides deleted sources until they come back', async () => {
    const target = await created('/api/goals', {
      projectId: (await created('/api/projects', { title: 'P' })).id,
      title: 'G',
      kind: 'outcome',
    });
    await as.patch(`/api/goals/${target.id}`, { description: doc([target.id, 'G']) });
    expect(await backlinksOf(target.id)).toEqual([]);

    const t = await created('/api/tasks', { title: 'T', description: doc([target.id, 'G']) });
    await as.del(`/api/tasks/${t.id}`);
    expect(await backlinksOf(target.id)).toEqual([]);
    await as.post(`/api/tasks/${t.id}/restore`);
    expect((await backlinksOf(target.id)).map((l) => l.id)).toEqual([t.id]);
  });

  it('rebuilds links when a deleted project comes back, and purges orphans', async () => {
    const target = await created('/api/tasks', { title: 'Inbox thing' });
    const p = await created('/api/projects', {
      title: 'P',
      description: doc([target.id, 'Inbox thing']),
    });
    const t = await created('/api/tasks', {
      title: 'In P',
      projectId: p.id,
      description: doc([target.id, 'x']),
    });
    expect(await backlinksOf(target.id)).toHaveLength(2);

    const { body } = await as.del(`/api/projects/${p.id}`);
    expect(await backlinksOf(target.id)).toEqual([]);
    expect(await resolve(p.id, t.id)).toEqual([]);
    expect((await runPurge()).links).toBe(2);

    await as.post(`/api/snapshots/${body.snapshotId}/restore`);
    expect((await backlinksOf(target.id)).map((l) => l.id).sort()).toEqual([p.id, t.id].sort());
    expect(await resolve(p.id)).toMatchObject([{ id: p.id, title: 'P' }]);
  });

  it('purges links once their deleted source is purged', async () => {
    const target = await created('/api/tasks', { title: 'Target' });
    const t = await created('/api/tasks', { title: 'T', description: doc([target.id, 'x']) });
    await as.del(`/api/tasks/${t.id}`);
    expect((await runPurge()).links).toBe(0);
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await runPurge(later)).toMatchObject({ tasks: 1, links: 1 });
    expect(await db.$count(links)).toBe(0);
  });

  it('keeps accounts apart', async () => {
    const userId = newId('user');
    await db.insert(users).values({ id: userId, name: 'Eve', email: 'eve@example.com' });
    const theirProject = newId('project');
    await db.insert(projects).values({ id: theirProject, userId, title: 'Secret' });
    const theirGoal = newId('goal');
    await db
      .insert(goals)
      .values({ id: theirGoal, userId, projectId: theirProject, title: 'Hidden', kind: 'outcome' });

    // Mentioning someone else's id stores a link, but it resolves to nothing for anyone here…
    const t = await created('/api/tasks', { title: 'T', description: doc([theirGoal, 'Hidden']) });
    expect(await resolve(theirGoal, theirProject, t.id)).toMatchObject([{ id: t.id }]);
    // …and asking for their backlinks answers 404, like any of their ids.
    expect((await as.get(`/api/entities/${theirGoal}/backlinks`)).status).toBe(404);
  });

  it('validates ids', async () => {
    expect((await as.get('/api/entities/resolve?ids=')).status).toBe(400);
    expect((await as.get('/api/entities/resolve?ids=tsk_nope')).status).toBe(400);
    expect((await as.get(`/api/entities/resolve?ids=${newId('snapshot')}`)).status).toBe(400);
    const many = Array.from({ length: 101 }, () => newId('task')).join(',');
    expect((await as.get(`/api/entities/resolve?ids=${many}`)).status).toBe(400);
    expect((await as.get('/api/entities/nope/backlinks')).status).toBe(400);
    expect(await db.$count(snapshots)).toBe(0);
  });
});

describe('search', () => {
  type Hit = { kind: string; title: string; match: string; snippet: string | null };
  const find = async (q: string, extra = '') => {
    const res = await as.get(`/api/search?q=${encodeURIComponent(q)}${extra}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.results as Hit[];
  };
  const titles = (hits: Hit[]) => hits.map((h) => h.title);

  it('ranks titles first, matches words in any order, ignores accents', async () => {
    const p = await created('/api/projects', { title: 'Cálculo II' });
    await created('/api/tasks', { title: 'Revisar cálculo', projectId: p.id });
    await created('/api/tasks', {
      title: 'Lista 3',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Exercícios de cálculo e álgebra' }],
          },
        ],
      },
    });
    await created('/api/tasks', { title: 'Unrelated' });

    const hits = await find('calc');
    expect(titles(hits)).toEqual(['Cálculo II', 'Revisar cálculo', 'Lista 3']);
    expect(hits[1]).toMatchObject({ kind: 'task', match: 'title', snippet: null });
    expect(hits[2]).toMatchObject({ match: 'text', snippet: 'Exercícios de cálculo e álgebra' });

    expect(titles(await find('calculo revisar'))).toEqual(['Revisar cálculo']);
    expect(titles(await find('ALGEB'))).toEqual(['Lista 3']);
  });

  it('finds titles with a typo', async () => {
    await created('/api/projects', { title: 'Linear algebra' });
    expect(titles(await find('algerba'))).toEqual(['Linear algebra']);
    expect(await find('zzzz')).toEqual([]);
  });

  it('filters by kind, lists recent things for an empty query', async () => {
    const p = await created('/api/projects', { title: 'Thesis' });
    await created('/api/goals', { projectId: p.id, title: 'Thesis draft', kind: 'outcome' });
    await created('/api/tasks', { title: 'Thesis outline' });
    expect((await find('thesis', '&types=goal,project')).map((h) => h.kind).sort()).toEqual([
      'goal',
      'project',
    ]);
    const recent = await find('');
    expect(recent.map((h) => h.title)).toEqual(['Thesis outline', 'Thesis draft', 'Thesis']);
    expect(recent.every((h) => h.match === 'recent')).toBe(true);
    expect(await find('%')).toEqual([]);
    expect((await as.get('/api/search?q=x&types=snapshot')).status).toBe(400);
  });
});
