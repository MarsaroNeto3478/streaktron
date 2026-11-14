import { newId } from '@strekatron/shared/ids';
import { addDays } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, pushSubscriptions, userSettings } from '../src/db/schema';
import { runPush, setSender, type PushMessage } from '../src/services/push';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;
let today: string;
let sent: { endpoint: string; message: PushMessage }[];
/** Endpoints the fake push service says are gone. */
let gone: Set<string>;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  const me = (await as.get('/api/me')).body;
  userId = me.user.id;
  await db
    .update(userSettings)
    .set({ timezone: 'UTC', dayStartHour: 4 })
    .where(eq(userSettings.userId, userId));
  today = (await as.get('/api/me')).body.today;
  sent = [];
  gone = new Set();
  setSender(async (sub, message) => {
    if (gone.has(sub.endpoint)) return 410;
    sent.push({ endpoint: sub.endpoint, message });
    return 201;
  });
});

afterEach(() => setSender(null));

const device = (n: number) => ({
  endpoint: `https://push.example.com/send/device-${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});
/** Late evening of the user's day (UTC, day starting at 4:00). */
const evening = () => new Date(`${today}T23:30:00Z`);

describe('push (D45)', () => {
  it('keeps this device’s subscription, gives the public key, forgets it on request', async () => {
    const key = await as.get('/api/push');
    expect(key.body).toMatchObject({ devices: 0 });
    expect(key.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect((await as.post('/api/push/subscriptions', device(1))).body).toEqual({ devices: 1 });
    // The same browser again: still one.
    expect((await as.post('/api/push/subscriptions', device(1))).body).toEqual({ devices: 1 });
    expect((await as.post('/api/push/subscriptions', { endpoint: 'nope' })).status).toBe(400);
    const off = await as.post('/api/push/subscriptions/remove', { endpoint: device(1).endpoint });
    expect(off.body).toEqual({ devices: 0 });
  });

  it('a test push reaches every device; a gone device is forgotten', async () => {
    await as.post('/api/push/subscriptions', device(1));
    await as.post('/api/push/subscriptions', device(2));
    gone.add(device(2).endpoint);
    expect((await as.post('/api/push/test')).body).toEqual({ delivered: 1 });
    expect(sent.map((s) => s.endpoint)).toEqual([device(1).endpoint]);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  });

  it('sends the habits reminder once a day, and the streak one only when asked', async () => {
    await as.post('/api/habits', {
      title: 'Read',
      schedule: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    });
    // Without a device nothing is sent.
    expect(await runPush(evening())).toBe(0);
    await as.post('/api/push/subscriptions', device(1));
    // Too early in the day.
    expect(await runPush(new Date(`${today}T12:00:00Z`))).toBe(0);
    expect(await runPush(evening())).toBe(1);
    expect(sent[0]!.message).toMatchObject({
      title: '“Read” is still open today',
      url: '/habits',
      tag: 'strekatron-habits',
    });
    expect(await runPush(evening())).toBe(0);

    // A streak to keep (yesterday was active), today not active yet; the reminder is opt-in.
    await db.insert(activity).values({
      id: newId('activity'),
      userId,
      type: 'task_completed',
      entityId: newId('task'),
      localDate: addDays(today, -1),
      occurredAt: new Date(`${addDays(today, -1)}T15:00:00Z`),
      payload: { effort: 'S', projectId: null, subtask: false },
    });
    expect(await runPush(evening())).toBe(0);
    const reminders = {
      habits: { on: true, hour: 20 },
      streak: { on: true, hour: 21 },
      focus: true,
    };
    expect((await as.patch('/api/settings', { reminders })).status).toBe(200);
    expect(await runPush(evening())).toBe(1);
    expect(sent[1]!.message).toMatchObject({ title: 'Your 1-day streak is waiting' });
  });

  it('tells a device when a focus session’s time is up, once', async () => {
    await as.post('/api/push/subscriptions', device(1));
    const p = await as.post('/api/projects', { title: 'Thesis' });
    const s = await as.post('/api/focus/start', { plannedMinutes: 1, projectId: p.body.id });
    expect(s.status).toBe(201);
    expect(await runPush(new Date())).toBe(0); // not yet
    const later = new Date(Date.now() + 90_000);
    expect(await runPush(later)).toBe(1);
    expect(sent[0]!.message).toMatchObject({
      title: 'Focus time is up',
      body: '1 min on “Thesis”. Finish it to count it.',
      tag: 'strekatron-focus',
    });
    expect(await runPush(later)).toBe(0);
  });

  it('stays quiet about focus when that reminder is off', async () => {
    await as.post('/api/push/subscriptions', device(1));
    await as.patch('/api/settings', {
      reminders: { habits: { on: false, hour: 20 }, streak: { on: false, hour: 21 }, focus: false },
    });
    await as.post('/api/focus/start', { plannedMinutes: 1 });
    expect(await runPush(new Date(Date.now() + 90_000))).toBe(0);
  });
});
