// Writes made offline and sent later (D55): a client-made task id makes a resend harmless, and
// `X-Occurred-At` puts the change on the day it was made.

import { newId } from '@strekatron/shared/ids';
import { addDays } from '@strekatron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity } from '../src/db/schema';
import { occurredAt, OFFLINE_MAX_AGE_MS } from '../src/http/game';
import { client, request, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let cookie: string;
let userId: string;
let today: string;

beforeEach(async () => {
  await resetDb();
  cookie = await setUpOwner();
  as = client(cookie);
  const me = (await as.get('/api/me')).body;
  userId = me.user.id;
  today = me.today;
});

const DAY = 24 * 3600_000;

/** A write sent from the queue: made at `at`. */
async function sendAt(at: Date | string, method: string, path: string, body: unknown = {}) {
  const res = await request(path, {
    method,
    body,
    cookie,
    headers: { 'x-occurred-at': typeof at === 'string' ? at : at.toISOString() },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const activities = (type: (typeof activity.$inferSelect)['type'], entityId: string) =>
  db
    .select()
    .from(activity)
    .where(
      and(eq(activity.userId, userId), eq(activity.type, type), eq(activity.entityId, entityId)),
    );

describe('offline writes (D55)', () => {
  it('a task with a client-made id is created once, however often it is sent', async () => {
    const id = newId('task');
    const first = await as.post('/api/tasks', { id, title: 'Buy paper' });
    expect(first.status).toBe(201);
    expect(first.body.id).toBe(id);

    const again = await as.post('/api/tasks', { id, title: 'Buy paper' });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(id);

    const inbox = await as.get('/api/tasks?project=inbox');
    expect(inbox.body.tasks.filter((t: { id: string }) => t.id === id)).toHaveLength(1);
    expect(await activities('item_created', id)).toHaveLength(1);
  });

  it('refuses an id that isn’t a task id', async () => {
    const res = await as.post('/api/tasks', { id: newId('project'), title: 'Nope' });
    expect(res.status).toBe(400);
  });

  it('a task completed yesterday offline counts for yesterday', async () => {
    const task = (await as.post('/api/tasks', { title: 'Read chapter 2' })).body;
    const at = new Date(Date.now() - DAY);
    const done = await sendAt(at, 'POST', `/api/tasks/${task.id}/complete`);
    expect(done.status).toBe(200);
    expect(new Date(done.body.completedAt).getTime()).toBe(at.getTime());

    const [row] = await activities('task_completed', task.id);
    expect(row!.localDate).toBe(addDays(today, -1));
    expect(row!.occurredAt.getTime()).toBe(at.getTime());
  });

  it('a habit checked in yesterday offline is checked for yesterday', async () => {
    const habit = (
      await as.post('/api/habits', {
        title: 'Stretch',
        schedule: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
      })
    ).body;
    const res = await sendAt(new Date(Date.now() - DAY), 'POST', `/api/habits/${habit.id}/checkin`);
    expect(res.status).toBe(200);
    expect(res.body.checkedYesterday).toBe(true);
    expect(res.body.checkedToday).toBe(false);
  });

  it('refuses a change made more than a week ago, and changes nothing', async () => {
    const task = (await as.post('/api/tasks', { title: 'Old' })).body;
    const res = await sendAt(
      new Date(Date.now() - 8 * DAY),
      'POST',
      `/api/tasks/${task.id}/complete`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('offline_too_old');
    expect((await as.get(`/api/tasks/${task.id}`)).body.completedAt).toBeNull();
  });

  it('a time in the future counts as now; nonsense is refused', async () => {
    const task = (await as.post('/api/tasks', { title: 'Soon' })).body;
    const before = Date.now();
    const res = await sendAt(new Date(Date.now() + DAY), 'POST', `/api/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    const at = new Date(res.body.completedAt).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);

    const bad = await sendAt('yesterday-ish', 'POST', `/api/tasks/${task.id}/reopen`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_occurred_at');
  });

  it('occurredAt reads the header', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(occurredAt(undefined, now)).toBeNull();
    expect(occurredAt('2026-11-16T09:00:00Z', now)?.toISOString()).toBe('2026-11-16T09:00:00.000Z');
    expect(occurredAt('2026-11-17T09:00:00Z', now)).toBeNull();
    const edge = new Date(now.getTime() - OFFLINE_MAX_AGE_MS).toISOString();
    expect(occurredAt(edge, now)?.toISOString()).toBe(edge);
    expect(() => occurredAt('2026-11-01T00:00:00Z', now)).toThrow(/week ago/);
  });
});
