import { newId } from '@streaktron/shared/ids';
import { addDays } from '@streaktron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, habits, quests as questsTable, users, userSettings } from '../src/db/schema';
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
  // No quests in the way of exact XP, unless a test turns them on.
  await quests();
});

async function quests(...keep: string[]) {
  const all = ['quick', 'daily', 'time', 'make', 'weekly'];
  await db
    .update(userSettings)
    .set({
      questSettings: {
        restingTypes: all.filter((t) => !keep.includes(t)),
        timeQuestMinMinutes: 15,
        timeQuestMaxMinutes: 180,
      },
    })
    .where(eq(userSettings.userId, userId));
}

const EVERY_DAY = { type: 'weekdays' as const, days: [0, 1, 2, 3, 4, 5, 6] };

const newHabit = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/habits', { title, schedule: EVERY_DAY, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; streak: { current: number } };
};

/** Pretend the habit was made `days` ago, so check-ins before today count for it. */
const age = (id: string, days: number) =>
  db
    .update(habits)
    .set({ createdAt: new Date(Date.now() - days * 86_400_000) })
    .where(eq(habits.id, id));

describe('habits', () => {
  it('creates, lists, edits, archives and deletes', async () => {
    const h = await newHabit('Read 20 pages', { notes: 'Before bed', minMinutes: 20 });
    expect(h).toMatchObject({ title: 'Read 20 pages', notes: 'Before bed', dueToday: true });

    const list = await as.get('/api/habits');
    expect(list.body.habits.map((x: { id: string }) => x.id)).toEqual([h.id]);

    const edited = await as.patch(`/api/habits/${h.id}`, {
      schedule: { type: 'per_week', count: 3 },
    });
    expect(edited.body.schedule).toEqual({ type: 'per_week', count: 3 });

    await as.patch(`/api/habits/${h.id}`, { archived: true });
    expect((await as.get('/api/habits')).body.habits).toEqual([]);
    expect((await as.get('/api/habits?archived=true')).body.habits).toHaveLength(1);
    const checkArchived = await as.post(`/api/habits/${h.id}/checkin`, {});
    expect(checkArchived.status).toBe(400);

    await as.patch(`/api/habits/${h.id}`, { archived: false });
    expect((await as.del(`/api/habits/${h.id}`)).status).toBe(200);
    expect((await as.get(`/api/habits/${h.id}`)).status).toBe(404);
    expect((await as.post(`/api/habits/${h.id}/restore`)).status).toBe(200);
    expect((await as.get(`/api/habits/${h.id}`)).status).toBe(200);
  });

  it('rejects an empty schedule and another account’s project', async () => {
    const bad = await as.post('/api/habits', {
      title: 'Nothing',
      schedule: { type: 'weekdays', days: [] },
    });
    expect(bad.status).toBe(400);
    const missing = await as.post('/api/habits', {
      title: 'Nope',
      schedule: EVERY_DAY,
      projectId: 'prj_01JC3Z0000000000000000000A',
    });
    expect(missing.status).toBe(404);
  });

  it('checks in once a day for 10 XP; unchecking keeps the XP (D15)', async () => {
    const h = await newHabit('Stretch');
    const first = await as.post(`/api/habits/${h.id}/checkin`, {});
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ checkedToday: true, streak: { current: 1 } });
    expect(first.body.game?.xp).toBe(10);
    expect(first.body.game?.state.daily.current).toBe(1);

    const again = await as.post(`/api/habits/${h.id}/checkin`, {});
    expect(again.body.game?.xp ?? 0).toBe(0);

    const off = await as.del(`/api/habits/${h.id}/checkin/${today}`);
    expect(off.body).toMatchObject({ checkedToday: false, streak: { current: 0 } });
    const back = await as.post(`/api/habits/${h.id}/checkin`, {});
    expect(back.body.game?.xp ?? 0).toBe(0);

    const state = (await as.get('/api/game/state')).body;
    expect(state.xp).toBe(10);
    const log = await db
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.type, 'habit_checked')));
    expect(log).toHaveLength(2);
  });

  it('allows yesterday for a forgotten check-in, nothing older or later (D34)', async () => {
    const h = await newHabit('Journal');
    await age(h.id, 3);
    const yesterday = addDays(today, -1);
    const late = await as.post(`/api/habits/${h.id}/checkin`, { date: yesterday });
    expect(late.status).toBe(200);
    expect(late.body).toMatchObject({ checkedYesterday: true, streak: { current: 1 } });
    // The XP and the active day go to today.
    const [row] = await db
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.type, 'habit_checked')));
    expect(row).toMatchObject({ localDate: today, payload: { date: yesterday } });

    const today2 = await as.post(`/api/habits/${h.id}/checkin`, {});
    expect(today2.body.streak.current).toBe(2);

    expect(
      (await as.post(`/api/habits/${h.id}/checkin`, { date: addDays(today, -2) })).status,
    ).toBe(400);
    expect((await as.post(`/api/habits/${h.id}/checkin`, { date: addDays(today, 1) })).status).toBe(
      400,
    );
  });

  it('shows today’s habits on Today', async () => {
    const due = await newHabit('Every day');
    const weekday = (Number(new Date(`${today}T12:00:00Z`).getUTCDay()) + 1) % 7;
    await newHabit('Not today', { schedule: { type: 'weekdays', days: [weekday] } });
    const res = await as.get('/api/today');
    expect(res.body.habits.map((h: { id: string }) => h.id)).toEqual([due.id]);
  });

  it('completes “Check in all habits due today”', async () => {
    const a = await newHabit('Read');
    const b = await newHabit('Run');
    await quests('daily');
    await as.get('/api/quests');
    const id = newId('quest');
    await db.insert(questsTable).values({
      id,
      userId,
      type: 'daily',
      templateKey: 'daily.all_habits',
      title: 'Check in all 2 habits due today',
      periodStart: today,
      periodEnd: today,
      target: 2,
      rewardXp: 20,
      boxTier: 'standard',
      params: { habitIds: [a.id, b.id] },
      offeredAt: new Date(Date.now() - 1000),
    });
    const one = await as.post(`/api/habits/${a.id}/checkin`, {});
    expect(one.body.game?.questsDone ?? []).toEqual([]);
    const done = await as.post(`/api/habits/${b.id}/checkin`, {});
    expect(done.body.game.questsDone).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  it('another account’s habit answers 404', async () => {
    const otherId = newId('user');
    await db.insert(users).values({ id: otherId, name: 'Eve', email: 'eve@example.com' });
    const id = newId('habit');
    await db.insert(habits).values({ id, userId: otherId, title: 'Theirs', schedule: EVERY_DAY });
    expect((await as.get(`/api/habits/${id}`)).status).toBe(404);
    expect((await as.post(`/api/habits/${id}/checkin`, {})).status).toBe(404);
    expect((await as.patch(`/api/habits/${id}`, { title: 'Mine' })).status).toBe(404);
  });
});
