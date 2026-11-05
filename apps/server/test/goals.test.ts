import { newId } from '@strekatron/shared/ids';
import { addDays, startOfWeek } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, goals } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;
let today: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  const me = (await as.get('/api/me')).body;
  userId = me.user.id;
  today = me.today;
});

const created = async (path: string, body: Record<string, unknown>) => {
  const res = await as.post(path, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
};

/** Finished focus on a day, straight into the log. */
const focus = (day: string, minutes: number, projectId: string | null) =>
  db.insert(activity).values({
    id: newId('activity'),
    userId,
    type: 'focus_completed',
    entityId: newId('focusSession'),
    localDate: day,
    occurredAt: new Date(`${day}T15:00:00Z`),
    payload: { minutes, projectId, taskId: null },
  });

describe('commitment goal progress (D40)', () => {
  it('comes from focus on the goal’s project this week, with the pace and the streak', async () => {
    const p = await created('/api/projects', { title: 'Thesis' });
    const other = await created('/api/projects', { title: 'Other' });
    const g = await created('/api/goals', {
      projectId: p.id,
      title: 'Write every week',
      kind: 'commitment',
      targetMinutes: 120,
      period: 'week',
    });
    const outcome = await created('/api/goals', {
      projectId: p.id,
      title: 'Ship',
      kind: 'outcome',
    });
    // The goal has existed for a while; last week was met.
    await db
      .update(goals)
      .set({ createdAt: new Date(`${addDays(today, -30)}T15:00:00Z`) })
      .where(eq(goals.id, g.id));
    const week = startOfWeek(today, 1);
    await focus(addDays(week, -3), 120, p.id);
    await focus(today, 30, p.id);
    await focus(today, 25, p.id);
    await focus(today, 500, other.id); // another project's focus doesn't count
    await focus(today, 500, null);

    const page = (await as.get(`/api/projects/${p.id}`)).body;
    const goal = page.goals.find((x: { id: string }) => x.id === g.id);
    expect(goal.progress).toMatchObject({
      start: week,
      end: addDays(week, 7),
      minutes: 55,
      target: 120,
      streak: 1,
    });
    expect(goal.progress.perDay).toBe(Math.ceil(65 / goal.progress.daysLeft));
    expect(goal.progress.history.at(-1)).toMatchObject({ start: addDays(week, -7), met: true });
    expect(page.goals.find((x: { id: string }) => x.id === outcome.id).progress).toBeNull();

    // The goal sheet shows the same; meeting the target marks it done.
    await focus(today, 65, p.id);
    const sheet = (await as.get(`/api/goals/${g.id}`)).body;
    expect(sheet.progress).toMatchObject({ minutes: 120, pace: 'done', perDay: 0, streak: 2 });
  });
});
