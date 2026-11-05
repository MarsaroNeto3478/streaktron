import { newId } from '@streaktron/shared/ids';
import { addDays } from '@streaktron/shared/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { calendarEvents, users } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let today: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  today = (await as.get('/api/me')).body.today;
});

const newEvent = async (body: Record<string, unknown>) => {
  const res = await as.post('/api/events', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
};

const calendar = async (from: string, to: string) => {
  const res = await as.get(`/api/calendar?from=${from}&to=${to}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as {
    events: { eventId: string; date: string; endDate: string; startTime: string | null }[];
    tasks: { id: string }[];
    focus: { date: string; minutes: number }[];
  };
};

describe('events', () => {
  it('creates a one-off event and shows it in its range only', async () => {
    const e = await newEvent({
      title: 'Exam',
      startDate: addDays(today, 3),
      startTime: '09:00',
      endTime: '11:00',
    });
    const cal = await calendar(today, addDays(today, 6));
    expect(cal.events).toMatchObject([
      { eventId: e.id, date: addDays(today, 3), startTime: '09:00' },
    ]);
    expect((await calendar(addDays(today, 4), addDays(today, 6))).events).toEqual([]);
  });

  it('repeats weekly, skips one occurrence, and edits the series', async () => {
    const e = await newEvent({
      title: 'Lecture',
      startDate: today,
      startTime: '10:00',
      recurrence: { freq: 'weekly' },
    });
    const dates = (await calendar(today, addDays(today, 27))).events.map((o) => o.date);
    expect(dates).toEqual([0, 7, 14, 21].map((n) => addDays(today, n)));

    const skipped = await as.post(`/api/events/${e.id}/skip`, { date: addDays(today, 7) });
    expect(skipped.status).toBe(200);
    const after = (await calendar(today, addDays(today, 27))).events.map((o) => o.date);
    expect(after).toEqual([0, 14, 21].map((n) => addDays(today, n)));
    // Skipping a date that isn't an occurrence.
    expect((await as.post(`/api/events/${e.id}/skip`, { date: addDays(today, 1) })).status).toBe(
      404,
    );

    const edited = await as.patch(`/api/events/${e.id}`, {
      recurrence: { freq: 'weekly', interval: 2 },
    });
    expect(edited.body).toMatchObject({
      recurrence: { freq: 'weekly', interval: 2 },
      skipDates: [],
    });
    const every2 = (await calendar(today, addDays(today, 27))).events.map((o) => o.date);
    expect(every2).toEqual([0, 14].map((n) => addDays(today, n)));
  });

  it('shows an all-day event spanning days, even when it started before the range', async () => {
    const e = await newEvent({
      title: 'Trip',
      startDate: addDays(today, -2),
      endDate: addDays(today, 2),
    });
    const cal = await calendar(today, addDays(today, 6));
    expect(cal.events).toMatchObject([
      { eventId: e.id, date: addDays(today, -2), endDate: addDays(today, 2), startTime: null },
    ]);
  });

  it('rejects shapes that don’t make sense', async () => {
    const bad = [
      { title: 'A', startDate: today, endDate: addDays(today, -1) },
      { title: 'B', startDate: today, startTime: '10:00', endTime: '09:00' },
      { title: 'C', startDate: today, endTime: '09:00' },
      { title: 'D', startDate: today, startTime: '10:00', endDate: addDays(today, 1) },
      { title: 'E', startDate: today, recurrence: { freq: 'daily', until: addDays(today, -1) } },
      { title: 'F', startDate: today, startTime: '25:00' },
    ];
    for (const body of bad) {
      expect((await as.post('/api/events', body)).status, JSON.stringify(body)).toBe(400);
    }
    const e = await newEvent({ title: 'Ok', startDate: today, startTime: '10:00' });
    expect((await as.patch(`/api/events/${e.id}`, { endTime: '08:00' })).status).toBe(400);
    expect((await as.post(`/api/events/${e.id}/skip`, { date: today })).status).toBe(400);
  });

  it('deletes and restores; counts down on Today', async () => {
    const e = await newEvent({ title: 'Deadline', startDate: addDays(today, 5), countdown: true });
    await newEvent({ title: 'Standup', startDate: today, startTime: '09:30' });
    const t = (await as.get('/api/today')).body;
    expect(t.countdowns).toMatchObject([{ eventId: e.id, date: addDays(today, 5) }]);
    expect(t.agenda.map((o: { title: string }) => o.title)).toEqual(['Standup']);

    expect((await as.del(`/api/events/${e.id}`)).status).toBe(200);
    expect((await as.get('/api/today')).body.countdowns).toEqual([]);
    expect((await as.post(`/api/events/${e.id}/restore`)).status).toBe(200);
    expect((await as.get('/api/today')).body.countdowns).toHaveLength(1);
  });

  it('puts dated tasks in the calendar and limits the range', async () => {
    const t = await as.post('/api/tasks', { title: 'Essay', scheduledDate: addDays(today, 2) });
    await as.post('/api/tasks', { title: 'No date' });
    const cal = await calendar(today, addDays(today, 6));
    expect(cal.tasks.map((x) => x.id)).toEqual([t.body.id]);
    expect((await as.get(`/api/calendar?from=${today}&to=${addDays(today, 200)}`)).status).toBe(
      400,
    );
  });

  it('another account’s event answers 404', async () => {
    const otherId = newId('user');
    await db.insert(users).values({ id: otherId, name: 'Eve', email: 'eve@example.com' });
    const id = newId('event');
    await db
      .insert(calendarEvents)
      .values({ id, userId: otherId, title: 'Theirs', startDate: today });
    expect((await as.get(`/api/events/${id}`)).status).toBe(404);
    expect((await as.patch(`/api/events/${id}`, { title: 'Mine' })).status).toBe(404);
    expect((await calendar(today, today)).events).toEqual([]);
  });
});
