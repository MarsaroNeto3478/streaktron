import { newId } from '@strekatron/shared/ids';
import { docFromText } from '@strekatron/shared/rich';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { areas, snapshots, tasks, users } from '../src/db/schema';
import { runPurge } from '../src/jobs/purge';
import { client, request, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
});

const newProject = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/projects', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; status: string };
};

const board = async (projectId: string) => {
  const { body } = await as.get(`/api/projects/${projectId}`);
  return body as {
    project: {
      nextAction: { id: string; pinned: boolean } | null;
      counts: { open: number; done: number };
    };
    columns: { id: string; title: string; category: string }[];
    goals: { id: string }[];
  };
};

const newTask = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/tasks', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as {
    id: string;
    columnId: string | null;
    status: string;
    completedAt: string | null;
  };
};

const columnTitles = async (projectId: string, columnId: string) => {
  const { body } = await as.get(`/api/tasks?project=${projectId}`);
  return (body.tasks as { title: string; columnId: string }[])
    .filter((t) => t.columnId === columnId)
    .map((t) => t.title);
};

/** Another account's data, written straight to the database. */
async function foreignArea() {
  const userId = newId('user');
  await db.insert(users).values({ id: userId, name: 'Eve', email: 'eve@example.com' });
  const id = newId('area');
  await db.insert(areas).values({ id, userId, title: 'Not yours' });
  return id;
}

describe('access', () => {
  it('needs a session on every structure route', async () => {
    for (const path of [
      '/api/areas',
      '/api/projects',
      '/api/tasks',
      '/api/search?q=x',
      '/api/snapshots',
    ]) {
      expect((await request(path)).status, path).toBe(401);
    }
  });

  it('hides other accounts’ rows', async () => {
    const id = await foreignArea();
    expect((await as.patch(`/api/areas/${id}`, { title: 'Mine now' })).status).toBe(404);
    expect((await as.post('/api/projects', { title: 'P', areaId: id })).status).toBe(404);
    expect((await as.get('/api/areas')).body.areas).toEqual([]);
  });

  it('rejects ids of the wrong kind', async () => {
    const res = await as.patch(`/api/tasks/${newId('project')}`, { title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });
});

describe('areas', () => {
  it('are created in order, edited, archived and reordered', async () => {
    const uni = (
      await as.post('/api/areas', { title: 'University', color: 'blue', icon: 'graduation-cap' })
    ).body;
    const side = (await as.post('/api/areas', { title: 'Side projects' })).body;
    expect(side).toMatchObject({ color: 'stone', icon: 'folder' });

    const edited = await as.patch(`/api/areas/${uni.id}`, {
      description: docFromText('Semester 5'),
      archived: true,
    });
    expect(edited.body).toMatchObject({ descriptionText: 'Semester 5' });
    expect(edited.body.archivedAt).not.toBeNull();

    const reordered = await as.post('/api/areas/reorder', { ids: [side.id, uni.id] });
    expect(reordered.body.areas.map((a: { title: string }) => a.title)).toEqual([
      'Side projects',
      'University',
    ]);
    expect((await as.post('/api/areas/reorder', { ids: [side.id] })).status).toBe(409);
  });

  it('rejects unknown colors and icons', async () => {
    expect((await as.post('/api/areas', { title: 'x', color: 'chartreuse' })).status).toBe(400);
    expect((await as.post('/api/areas', { title: 'x', icon: 'dragon' })).status).toBe(400);
    expect((await as.post('/api/areas', { title: '   ' })).status).toBe(400);
  });

  it('deleted with projects kept: they leave the area, and come back on restore', async () => {
    const area = (await as.post('/api/areas', { title: 'University' })).body;
    const p = await newProject('Linear Algebra', { areaId: area.id });
    const del = await as.del(`/api/areas/${area.id}`);
    expect(del.status).toBe(200);
    expect((await as.get(`/api/projects/${p.id}`)).body.project.areaId).toBeNull();

    const { body } = await as.get('/api/snapshots');
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0]).toMatchObject({ kind: 'area', title: 'University', projects: 0 });

    expect((await as.post(`/api/snapshots/${del.body.snapshotId}/restore`)).status).toBe(200);
    expect((await as.get(`/api/projects/${p.id}`)).body.project.areaId).toBe(area.id);
    expect((await as.get('/api/snapshots')).body.snapshots).toHaveLength(0);
  });

  it('deleted with its projects: everything comes back on restore', async () => {
    const area = (await as.post('/api/areas', { title: 'University' })).body;
    const p = await newProject('Linear Algebra', { areaId: area.id });
    const t = await newTask('Problem set 3', { projectId: p.id });
    await newTask('Question 1', { parentTaskId: t.id });

    const del = await as.del(`/api/areas/${area.id}?projects=delete`);
    expect((await as.get(`/api/projects/${p.id}`)).status).toBe(404);
    expect((await as.get('/api/snapshots')).body.snapshots[0]).toMatchObject({
      projects: 1,
      tasks: 2,
    });

    const restored = await as.post(`/api/snapshots/${del.body.snapshotId}/restore`);
    expect(restored.body).toMatchObject({ kind: 'area', parked: [] });
    const back = await as.get(`/api/projects/${p.id}`);
    expect(back.body.project).toMatchObject({ areaId: area.id, counts: { open: 1, done: 0 } });
    const subtasks = await as.get(`/api/tasks?parent=${t.id}`);
    expect(subtasks.body.tasks.map((s: { title: string }) => s.title)).toEqual(['Question 1']);
    expect((await as.post(`/api/snapshots/${del.body.snapshotId}/restore`)).status).toBe(404);
  });
});

describe('projects', () => {
  it('start active with a To do / Doing / Done board', async () => {
    const p = await newProject('Thesis');
    expect(p.status).toBe('active');
    const { columns, project } = await board(p.id);
    expect(columns.map((c) => [c.title, c.category])).toEqual([
      ['To do', 'todo'],
      ['Doing', 'in_progress'],
      ['Done', 'done'],
    ]);
    expect(project).toMatchObject({ counts: { open: 0, done: 0 }, nextAction: null });
  });

  it('enforce the active limit, and park one to make room', async () => {
    const [a] = [await newProject('A'), await newProject('B'), await newProject('C')];
    const over = await as.post('/api/projects', { title: 'D' });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('active_limit');
    expect(over.body.error.details.limit).toBe(3);
    expect(over.body.error.details.active.map((p: { title: string }) => p.title)).toEqual([
      'A',
      'B',
      'C',
    ]);

    const d = await newProject('D', { status: 'parked' });
    expect((await as.post(`/api/projects/${d.id}/status`, { status: 'active' })).status).toBe(409);

    const swap = await as.post(`/api/projects/${d.id}/status`, { status: 'active', park: a!.id });
    expect(swap.status).toBe(200);
    expect(
      Object.fromEntries(
        swap.body.projects.map((p: { title: string; status: string }) => [p.title, p.status]),
      ),
    ).toEqual({ D: 'active', A: 'parked' });
  });

  it('follow a lower limit set in settings', async () => {
    await newProject('A');
    const settings = await as.patch('/api/settings', { activeProjectLimit: 1 });
    expect(settings.body.activeProjectLimit).toBe(1);
    expect((await as.post('/api/projects', { title: 'B' })).status).toBe(409);
    expect((await as.patch('/api/settings', { activeProjectLimit: 0 })).status).toBe(400);
  });

  it('move through their lifecycle', async () => {
    const p = await newProject('A');
    const go = (status: string) => as.post(`/api/projects/${p.id}/status`, { status });
    expect((await go('completed')).status).toBe(200);
    expect((await go('archived')).status).toBe(200);
    const back = await go('active');
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('invalid_transition');
    expect((await go('parked')).status).toBe(200);
    expect((await go('parked')).status).toBe(200); // already there: nothing to do
  });

  it('pick a next action, or use a pinned one until it is done', async () => {
    const p = await newProject('A');
    const { columns } = await board(p.id);
    const [todo, doing] = columns;
    const first = await newTask('First', { projectId: p.id });
    const second = await newTask('Second', { projectId: p.id });
    expect((await board(p.id)).project.nextAction).toMatchObject({ id: first.id, pinned: false });

    await as.post(`/api/tasks/${second.id}/move`, { columnId: doing!.id, index: 0 });
    expect((await board(p.id)).project.nextAction?.id).toBe(second.id);

    await as.patch(`/api/projects/${p.id}`, { nextActionTaskId: first.id });
    expect((await board(p.id)).project.nextAction).toMatchObject({ id: first.id, pinned: true });

    await as.post(`/api/tasks/${first.id}/complete`);
    const after = await board(p.id);
    expect(after.project.nextAction).toMatchObject({ id: second.id, pinned: false });
    expect(after.project.counts).toEqual({ open: 1, done: 1 });
    expect(todo).toBeDefined();
  });

  it('only pin open tasks of the same project', async () => {
    const p = await newProject('A');
    const other = await newProject('B');
    const t = await newTask('Elsewhere', { projectId: other.id });
    const res = await as.patch(`/api/projects/${p.id}`, { nextActionTaskId: t.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_next_action');
  });

  it('are deleted into a snapshot and restored parked when the limit is full', async () => {
    const p = await newProject('A');
    const t = await newTask('Keep me', { projectId: p.id });
    await as.patch(`/api/projects/${p.id}`, { nextActionTaskId: t.id });
    const goal = (await as.post('/api/goals', { projectId: p.id, title: 'Ship', kind: 'outcome' }))
      .body;
    await as.patch(`/api/tasks/${t.id}`, { goalId: goal.id });

    const del = await as.del(`/api/projects/${p.id}`);
    expect(del.status).toBe(200);
    expect(await db.$count(tasks)).toBe(0);
    await newProject('B');
    await newProject('C');
    await newProject('D');

    const restored = await as.post(`/api/snapshots/${del.body.snapshotId}/restore`);
    expect(restored.body).toMatchObject({ kind: 'project', title: 'A', parked: ['A'] });
    const back = await board(p.id);
    expect(back.project).toMatchObject({
      status: 'parked',
      nextAction: { id: t.id, pinned: true },
    });
    expect(back.goals.map((g) => g.id)).toEqual([goal.id]);
    expect((await as.get(`/api/tasks/${t.id}`)).body.goalId).toBe(goal.id);
  });
});

describe('tasks', () => {
  it('are captured to the inbox, newest on top when asked', async () => {
    await newTask('Older');
    const t = await newTask('Buy a notebook', { position: 'top' });
    expect(t).toMatchObject({ columnId: null, status: 'todo' });
    const { body } = await as.get('/api/tasks?project=inbox');
    expect(body.tasks.map((x: { title: string }) => x.title)).toEqual(['Buy a notebook', 'Older']);
  });

  it('can’t have a goal or a column in the inbox', async () => {
    expect((await as.post('/api/tasks', { title: 'x', goalId: newId('goal') })).status).toBe(400);
    expect(
      (await as.post('/api/tasks', { title: 'x', columnId: newId('boardColumn') })).status,
    ).toBe(400);
  });

  it('agree with the board on what done means', async () => {
    const p = await newProject('A');
    const [todo, doing, done] = (await board(p.id)).columns;
    const t = await newTask('Read chapter 4', { projectId: p.id });
    expect(t.columnId).toBe(todo!.id);

    const moved = await as.post(`/api/tasks/${t.id}/move`, { columnId: done!.id, index: 0 });
    expect(moved.body).toMatchObject({ status: 'done', columnId: done!.id });
    expect(moved.body.completedAt).not.toBeNull();

    const back = await as.post(`/api/tasks/${t.id}/move`, { columnId: doing!.id, index: 0 });
    expect(back.body).toMatchObject({ status: 'in_progress', completedAt: null });

    const completed = await as.post(`/api/tasks/${t.id}/complete`);
    expect(completed.body).toMatchObject({ status: 'done', columnId: done!.id });
    const reopened = await as.post(`/api/tasks/${t.id}/reopen`);
    expect(reopened.body).toMatchObject({ status: 'todo', columnId: todo!.id, completedAt: null });
  });

  it('are ordered by drag and drop', async () => {
    const p = await newProject('A');
    const [todo, doing] = (await board(p.id)).columns;
    for (const title of ['a', 'b', 'c', 'd']) await newTask(title, { projectId: p.id });
    const ids = (await as.get(`/api/tasks?project=${p.id}`)).body.tasks.map(
      (t: { id: string }) => t.id,
    );

    await as.post(`/api/tasks/${ids[0]}/move`, { columnId: todo!.id, index: 2 });
    expect(await columnTitles(p.id, todo!.id)).toEqual(['b', 'c', 'a', 'd']);
    await as.post(`/api/tasks/${ids[3]}/move`, { columnId: todo!.id, index: 0 });
    expect(await columnTitles(p.id, todo!.id)).toEqual(['d', 'b', 'c', 'a']);
    await as.post(`/api/tasks/${ids[2]}/move`, { columnId: doing!.id, index: 5 });
    expect(await columnTitles(p.id, todo!.id)).toEqual(['d', 'b', 'a']);
    expect(await columnTitles(p.id, doing!.id)).toEqual(['c']);
  });

  it('only move within their own board', async () => {
    const p = await newProject('A');
    const other = await newProject('B');
    const [otherTodo] = (await board(other.id)).columns;
    const t = await newTask('x', { projectId: p.id });
    const res = await as.post(`/api/tasks/${t.id}/move`, { columnId: otherTodo!.id, index: 0 });
    expect(res.status).toBe(400);
    const inbox = await newTask('y');
    expect(
      (await as.post(`/api/tasks/${inbox.id}/move`, { columnId: otherTodo!.id, index: 0 })).status,
    ).toBe(400);
  });

  it('have one level of subtasks that follow their parent', async () => {
    const p = await newProject('A');
    const other = await newProject('B');
    const parent = await newTask('Write report', { projectId: p.id });
    const sub = await newTask('Outline', { parentTaskId: parent.id });
    expect(sub).toMatchObject({ columnId: null });
    expect((await as.post('/api/tasks', { title: 'deeper', parentTaskId: sub.id })).status).toBe(
      400,
    );
    await as.post(`/api/tasks/${sub.id}/complete`);

    const view = await as.get(`/api/tasks/${parent.id}`);
    expect(view.body.subtasks).toEqual({ total: 1, done: 1 });
    // Lists hold top-level tasks only.
    expect((await as.get(`/api/tasks?project=${p.id}`)).body.tasks).toHaveLength(1);

    expect((await as.patch(`/api/tasks/${sub.id}`, { projectId: other.id })).status).toBe(400);
    await as.patch(`/api/tasks/${parent.id}`, { projectId: other.id });
    expect((await as.get(`/api/tasks/${sub.id}`)).body.projectId).toBe(other.id);
  });

  it('move between projects and the inbox, landing in the right column', async () => {
    const p = await newProject('A');
    const [todo, , done] = (await board(p.id)).columns;
    const goal = (await as.post('/api/goals', { projectId: p.id, title: 'G', kind: 'outcome' }))
      .body;
    const t = await newTask('Triaged');
    const moved = await as.patch(`/api/tasks/${t.id}`, { projectId: p.id, goalId: goal.id });
    expect(moved.body).toMatchObject({ projectId: p.id, columnId: todo!.id, goalId: goal.id });

    const toInbox = await as.patch(`/api/tasks/${t.id}`, { projectId: null });
    expect(toInbox.body).toMatchObject({ projectId: null, columnId: null, goalId: null });

    await as.post(`/api/tasks/${t.id}/complete`);
    const doneMove = await as.patch(`/api/tasks/${t.id}`, { projectId: p.id });
    expect(doneMove.body.columnId).toBe(done!.id);
  });

  it('only take goals of their own project', async () => {
    const p = await newProject('A');
    const other = await newProject('B');
    const goal = (await as.post('/api/goals', { projectId: other.id, title: 'G', kind: 'outcome' }))
      .body;
    const t = await newTask('x', { projectId: p.id });
    const res = await as.patch(`/api/tasks/${t.id}`, { goalId: goal.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_goal');
  });

  it('are deleted with their subtasks and restored together', async () => {
    const parent = await newTask('Parent');
    const sub = await newTask('Child', { parentTaskId: parent.id });
    expect((await as.del(`/api/tasks/${parent.id}`)).status).toBe(200);
    expect((await as.get(`/api/tasks/${parent.id}`)).status).toBe(404);
    expect((await as.get('/api/tasks?project=inbox')).body.tasks).toHaveLength(0);
    expect((await as.post(`/api/tasks/${sub.id}/restore`)).status).toBe(409);

    expect((await as.post(`/api/tasks/${parent.id}/restore`)).status).toBe(200);
    expect((await as.get(`/api/tasks/${sub.id}`)).status).toBe(200);
  });

  it('keep dates and effort', async () => {
    const t = await newTask('Exam prep', {
      effort: 'L',
      dueDate: '2026-12-01',
      scheduledDate: '2026-11-20',
    });
    const res = await as.patch(`/api/tasks/${t.id}`, { effort: null, dueDate: '2026-12-02' });
    expect(res.body).toMatchObject({
      effort: null,
      dueDate: '2026-12-02',
      scheduledDate: '2026-11-20',
    });
    expect((await as.patch(`/api/tasks/${t.id}`, { dueDate: '2026-02-30' })).status).toBe(400);
  });
});

describe('board columns', () => {
  it('can be added, renamed and reordered', async () => {
    const p = await newProject('A');
    const added = await as.post(`/api/projects/${p.id}/columns`, {
      title: 'Review',
      category: 'in_progress',
    });
    expect(added.status).toBe(201);
    const ids = (await board(p.id)).columns.map((c) => c.id);
    const order = [ids[3]!, ids[0]!, ids[1]!, ids[2]!];
    const res = await as.post(`/api/projects/${p.id}/columns/reorder`, { ids: order });
    expect(res.body.columns.map((c: { title: string }) => c.title)).toEqual([
      'Review',
      'To do',
      'Doing',
      'Done',
    ]);
    await as.patch(`/api/columns/${ids[3]}`, { title: 'In review' });
    expect((await board(p.id)).columns[0]!.title).toBe('In review');
  });

  it('keep a done column and an open one', async () => {
    const p = await newProject('A');
    const [todo, doing, done] = (await board(p.id)).columns;
    expect((await as.del(`/api/columns/${done!.id}`)).status).toBe(409);
    expect((await as.patch(`/api/columns/${done!.id}`, { category: 'todo' })).status).toBe(409);
    expect((await as.del(`/api/columns/${doing!.id}`)).status).toBe(200);
    expect((await as.patch(`/api/columns/${todo!.id}`, { category: 'done' })).status).toBe(409);
  });

  it('hand their tasks on when deleted, and complete them when they become done', async () => {
    const p = await newProject('A');
    const [todo, doing] = (await board(p.id)).columns;
    const t = await newTask('x', { projectId: p.id, columnId: doing!.id });
    await as.del(`/api/columns/${doing!.id}`);
    expect((await as.get(`/api/tasks/${t.id}`)).body).toMatchObject({
      columnId: todo!.id,
      status: 'todo',
    });

    await as.post(`/api/projects/${p.id}/columns`, { title: 'Shipped', category: 'todo' });
    const shipped = (await board(p.id)).columns.find((c) => c.title === 'Shipped')!;
    const u = await newTask('y', { projectId: p.id, columnId: shipped.id });
    await as.patch(`/api/columns/${shipped.id}`, { category: 'done' });
    expect((await as.get(`/api/tasks/${u.id}`)).body.status).toBe('done');
  });
});

describe('goals', () => {
  it('need a target and period when they are commitments', async () => {
    const p = await newProject('A');
    expect(
      (await as.post('/api/goals', { projectId: p.id, title: 'G', kind: 'commitment' })).status,
    ).toBe(400);
    const g = await as.post('/api/goals', {
      projectId: p.id,
      title: '4 h a week',
      kind: 'commitment',
      targetMinutes: 240,
      period: 'week',
    });
    expect(g.status).toBe(201);
    const outcome = await as.patch(`/api/goals/${g.body.id}`, { kind: 'outcome' });
    expect(outcome.body).toMatchObject({ kind: 'outcome', targetMinutes: null, period: null });
    expect((await as.patch(`/api/goals/${g.body.id}`, { kind: 'commitment' })).status).toBe(400);
    expect((await as.patch(`/api/goals/${g.body.id}`, { status: 'achieved' })).body.status).toBe(
      'achieved',
    );
  });

  it('are deleted and restored', async () => {
    const p = await newProject('A');
    const g = (await as.post('/api/goals', { projectId: p.id, title: 'G', kind: 'outcome' })).body;
    await as.del(`/api/goals/${g.id}`);
    expect((await board(p.id)).goals).toHaveLength(0);
    await as.post(`/api/goals/${g.id}/restore`);
    expect((await board(p.id)).goals).toHaveLength(1);
  });
});

describe('search', () => {
  it('finds titles ignoring accents and case, starts of titles first', async () => {
    const p = await newProject('Cálculo II');
    await newTask('Revisar cálculo', { projectId: p.id });
    await newTask('Unrelated');
    const { body } = await as.get('/api/search?q=calc');
    expect(body.results.map((r: { kind: string; title: string }) => [r.kind, r.title])).toEqual([
      ['project', 'Cálculo II'],
      ['task', 'Revisar cálculo'],
    ]);
    expect(body.results[1].context).toBe('Cálculo II');
    expect((await as.get('/api/search?q=%25')).body.results).toEqual([]);
  });
});

describe('purge', () => {
  it('removes deleted tasks and snapshots after 30 days', async () => {
    const t = await newTask('Gone');
    await as.del(`/api/tasks/${t.id}`);
    const p = await newProject('A');
    await as.del(`/api/projects/${p.id}`);

    expect(await runPurge()).toMatchObject({ tasks: 0, goals: 0, snapshots: 0 });
    const later = new Date(Date.now() + 31 * 86_400_000);
    await db.update(snapshots).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await runPurge(later)).toMatchObject({ tasks: 1, goals: 0, snapshots: 1 });
    expect(await db.$count(tasks, eq(tasks.id, t.id))).toBe(0);
  });
});

describe('dragging projects between areas', () => {
  const titlesIn = async (areaId: string | null) => {
    const { body } = await as.get('/api/projects');
    return (body.projects as { title: string; areaId: string | null; status: string }[])
      .filter((p) => p.areaId === areaId)
      .map((p) => p.title);
  };

  it('moves a project into another area at a position, and orders within one', async () => {
    const uni = (await as.post('/api/areas', { title: 'University' })).body;
    const side = (await as.post('/api/areas', { title: 'Side' })).body;
    const a = await newProject('A', { areaId: uni.id });
    await newProject('B', { areaId: uni.id });
    await newProject('C', { areaId: side.id, status: 'parked' });
    await newProject('D', { areaId: side.id, status: 'parked' });

    const res = await as.post(`/api/projects/${a.id}/move`, { areaId: side.id, index: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.projects.map((p: { title: string }) => p.title)).toEqual(['C', 'A', 'D']);
    expect(await titlesIn(side.id)).toEqual(['C', 'A', 'D']);
    expect(await titlesIn(uni.id)).toEqual(['B']);

    // Within the same area; an index past the end lands last.
    await as.post(`/api/projects/${a.id}/move`, { areaId: side.id, index: 99 });
    expect(await titlesIn(side.id)).toEqual(['C', 'D', 'A']);

    // Out of every area.
    await as.post(`/api/projects/${a.id}/move`, { areaId: null, index: 0 });
    expect(await titlesIn(null)).toEqual(['A']);
  });

  it('keeps closed projects after the ones in progress, and won’t drag them', async () => {
    const area = (await as.post('/api/areas', { title: 'Area' })).body;
    const done = await newProject('Done', { areaId: area.id });
    await as.post(`/api/projects/${done.id}/status`, { status: 'completed' });
    const x = await newProject('X');
    await as.post(`/api/projects/${x.id}/move`, { areaId: area.id, index: 5 });
    expect(await titlesIn(area.id)).toEqual(['X', 'Done']);
    const res = await as.post(`/api/projects/${done.id}/move`, { areaId: null, index: 0 });
    expect(res.status).toBe(400);
  });

  it('checks the area belongs to you', async () => {
    const p = await newProject('P');
    expect(
      (await as.post(`/api/projects/${p.id}/move`, { areaId: await foreignArea(), index: 0 }))
        .status,
    ).toBe(404);
  });
});
