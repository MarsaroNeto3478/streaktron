import { newId } from '@strekatron/shared/ids';
import { addDays } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { achievements, activity, userSettings } from '../src/db/schema';
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
  await db
    .update(userSettings)
    .set({
      questSettings: {
        restingTypes: ['quick', 'daily', 'time', 'make', 'weekly'],
        timeQuestMinMinutes: 15,
        timeQuestMaxMinutes: 180,
      },
    })
    .where(eq(userSettings.userId, userId));
});

const stored = () => db.select().from(achievements).where(eq(achievements.userId, userId));

describe('medals and prizes (D49)', () => {
  it('earns “First step” with the first task, once', async () => {
    const t = (await as.post('/api/tasks', { title: 'Read chapter 1' })).body;
    const done = await as.post(`/api/tasks/${t.id}/complete`);
    expect(done.body.game.achievements).toEqual([
      { key: 'tasks.1', kind: 'medal', title: 'First step' },
    ]);
    const t2 = (await as.post('/api/tasks', { title: 'Read chapter 2' })).body;
    const again = await as.post(`/api/tasks/${t2.id}/complete`);
    expect(again.body.game.achievements).toEqual([]);
    expect((await stored()).map((a) => [a.key, a.earnedOn])).toEqual([['tasks.1', today]]);
  });

  it('gives medals reached before they existed, with the day they were reached', async () => {
    const day = addDays(today, -20);
    for (let i = 0; i < 10; i++) {
      await db.insert(activity).values({
        id: newId('activity'),
        userId,
        type: 'task_completed',
        entityId: newId('task'),
        localDate: addDays(day, i),
        occurredAt: new Date(Date.now() - (20 - i) * 86_400_000),
        payload: { effort: null, projectId: null, subtask: false },
      });
    }
    const res = await as.get('/api/game/achievements');
    expect(res.status).toBe(200);
    const byKey = new Map(res.body.achievements.map((a: { key: string }) => [a.key, a] as const));
    expect(byKey.get('tasks.1')).toMatchObject({ earnedOn: day, value: 10 });
    expect(byKey.get('tasks.10')).toMatchObject({ earnedOn: addDays(day, 9) });
    expect(byKey.get('tasks.100')).toMatchObject({ earnedOn: null, value: 10, unit: 'tasks' });
    // Ten days in a row: the 7-day streak prize, on its seventh day.
    expect(byKey.get('daily_streak.7')).toMatchObject({ kind: 'prize', earnedOn: addDays(day, 6) });
    expect(res.body.earned.length).toBeGreaterThanOrEqual(3);
    expect((await as.get('/api/game/achievements')).body.earned).toEqual([]);
  });

  it('gives a prize for a finished project, kept if it is reopened', async () => {
    const p = (await as.post('/api/projects', { title: 'Thesis' })).body;
    expect((await as.post(`/api/projects/${p.id}/status`, { status: 'completed' })).status).toBe(
      200,
    );
    const res = await as.get('/api/game/achievements');
    expect(res.body.projectPrizes).toEqual([
      { key: `project.${p.id}`, title: 'Thesis', projectId: p.id, earnedOn: today },
    ]);
    await as.post(`/api/projects/${p.id}/status`, { status: 'active' });
    expect((await as.get('/api/game/achievements')).body.projectPrizes).toHaveLength(1);
  });
});
