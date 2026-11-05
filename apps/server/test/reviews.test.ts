import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { userSettings } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
  // Only the review quest, so the XP is exact.
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

const created = async (path: string, body: Record<string, unknown>) => {
  const res = await as.post(path, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
};

describe('weekly review', () => {
  it('sums up the last seven days, shows what stalled, and is done once a week', async () => {
    const moving = await created('/api/projects', { title: 'Thesis' });
    const idle = await created('/api/projects', { title: 'Side project' });
    const task = await created('/api/tasks', { title: 'Outline', projectId: moving.id });
    expect((await as.post(`/api/tasks/${task.id}/complete`)).status).toBe(200);

    const current = (await as.get('/api/reviews/current')).body;
    expect(current).toMatchObject({
      done: null,
      summary: { tasksDone: 1, activeDays: 1, focusMinutes: 0 },
    });
    expect(typeof current.window).toBe('boolean');
    expect(current.stalled.map((p: { id: string }) => p.id)).toEqual([idle.id]);
    expect(current.projects.find((p: { id: string }) => p.id === moving.id)).toMatchObject({
      tasks: 1,
    });

    // The week's review quest is on the board.
    const board = (await as.get('/api/quests')).body.quests;
    expect(board.filter((q: { type: string }) => q.type === 'review')).toHaveLength(1);

    const done = await as.post('/api/reviews/complete', {
      wentWell: 'Finished the outline',
      change: '',
    });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ weekStart: current.week, wentWell: 'Finished the outline' });
    // 50 for the review, 50 for its quest.
    expect(done.body.game.xp).toBe(100);
    expect(done.body.game.questsDone).toEqual([
      expect.objectContaining({ type: 'review', boxTier: 'large' }),
    ]);
    expect(done.body.game.state.daily.activeToday).toBe(true);

    // Once a week.
    const again = await as.post('/api/reviews/complete', {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('review_done');

    expect((await as.get('/api/reviews/current')).body.done).toMatchObject({
      wentWell: 'Finished the outline',
      summary: { tasksDone: 1 },
    });
    expect((await as.get('/api/reviews')).body.reviews).toHaveLength(1);
  });

  it('makes the day active on its own', async () => {
    const res = await as.post('/api/reviews/complete', {});
    expect(res.status).toBe(201);
    expect(res.body.game.state.daily).toMatchObject({ activeToday: true, current: 1 });
  });
});
