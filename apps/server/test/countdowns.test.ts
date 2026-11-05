import { addDays } from '@strekatron/shared/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let today: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  today = (await as.get('/api/me')).body.today;
});

const created = async (path: string, body: Record<string, unknown>) => {
  const res = await as.post(path, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
};

type C = { kind: string; id: string; date: string };
const summary = (cs: C[]) => cs.map((c) => `${c.kind}:${c.date}`);

describe('countdowns', () => {
  it('Today counts down to events marked so and to active projects’ due dates', async () => {
    const exam = await created('/api/projects', { title: 'Exam', dueDate: addDays(today, 10) });
    await created('/api/projects', { title: 'Past', dueDate: addDays(today, -1) });
    const parked = await created('/api/projects', {
      title: 'Later',
      dueDate: addDays(today, 3),
      status: 'parked',
    });
    const ev = await created('/api/events', {
      title: 'Presentation',
      startDate: addDays(today, 4),
      countdown: true,
    });

    const cs = (await as.get('/api/today')).body.countdowns as C[];
    expect(cs).toMatchObject([
      { kind: 'event', id: ev.id, date: addDays(today, 4) },
      { kind: 'project', id: exam.id, date: addDays(today, 10) },
    ]);
    // Overdue and parked projects don't count down.
    expect(cs.some((c) => c.id === parked.id)).toBe(false);
  });

  it('Today also counts down to the next three tasks, by due date or else planned day', async () => {
    const p = await created('/api/projects', { title: 'Work' });
    const planned = await created('/api/tasks', {
      title: 'Planned',
      projectId: p.id,
      scheduledDate: addDays(today, 1),
    });
    const due = await created('/api/tasks', {
      title: 'Due',
      dueDate: addDays(today, 2),
      scheduledDate: addDays(today, 9), // the due date wins
    });
    await created('/api/tasks', { title: 'Third', projectId: p.id, dueDate: addDays(today, 3) });
    await created('/api/tasks', { title: 'Fourth', projectId: p.id, dueDate: addDays(today, 4) });
    await created('/api/tasks', { title: 'Yesterday', scheduledDate: addDays(today, -1) });

    const cs = (await as.get('/api/today')).body.countdowns as C[];
    expect(summary(cs)).toEqual([
      `task:${addDays(today, 1)}`,
      `task:${addDays(today, 2)}`,
      `task:${addDays(today, 3)}`,
    ]);
    expect(cs.slice(0, 2).map((c) => c.id)).toEqual([planned.id, due.id]);
  });

  it('a project page counts down to its due date, its events and its next three task deadlines', async () => {
    const p = await created('/api/projects', { title: 'Thesis', dueDate: addDays(today, 30) });
    const other = await created('/api/projects', { title: 'Other' });
    await created('/api/events', {
      title: 'Defense rehearsal',
      startDate: addDays(today, 7),
      countdown: true,
      projectId: p.id,
    });
    await created('/api/events', {
      title: 'Elsewhere',
      startDate: addDays(today, 2),
      countdown: true,
      projectId: other.id,
    });
    for (const [title, days] of [
      ['Chapter 1', 5],
      ['Chapter 2', 12],
      ['Chapter 3', 20],
      ['Chapter 4', 25],
      ['Late one', -2],
    ] as const) {
      await created('/api/tasks', { title, projectId: p.id, dueDate: addDays(today, days) });
    }
    const done = await created('/api/tasks', {
      title: 'Done one',
      projectId: p.id,
      dueDate: addDays(today, 1),
    });
    await as.post(`/api/tasks/${done.id}/complete`);

    const page = (await as.get(`/api/projects/${p.id}`)).body;
    expect(summary(page.countdowns)).toEqual([
      `task:${addDays(today, 5)}`,
      `event:${addDays(today, 7)}`,
      `task:${addDays(today, 12)}`,
      `task:${addDays(today, 20)}`,
      `project:${addDays(today, 30)}`,
    ]);
  });
});
