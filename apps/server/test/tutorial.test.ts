import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { focusSessions, userSettings } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
  // Only the tour's quests, so the XP is exact.
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

const tour = async () => (await as.get('/api/tutorial')).body;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are untyped in tests
const ok = async (res: Promise<{ status: number; body: any }>, status = 200) => {
  const r = await res;
  expect(r.status, JSON.stringify(r.body)).toBe(status);
  return r.body;
};
const xp = async () => (await as.get('/api/game/state')).body.xp as number;

/** A 10-minute focus session, finished. */
async function focus10() {
  const s = await ok(as.post('/api/focus/start', { plannedMinutes: 10 }), 201);
  await db
    .update(focusSessions)
    .set({ startedAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(focusSessions.id, s.id));
  return ok(as.post(`/api/focus/${s.id}/finish`, {}));
}

describe('Streaky’s tour', () => {
  it('invites, asks, walks the five steps and ends', async () => {
    expect(await tour()).toMatchObject({ state: 'new', challenge: null, step: null });

    expect(await ok(as.post('/api/tutorial/start'))).toMatchObject({ state: 'question' });
    // Answering opens the first step; "too many projects" lowers the active limit to 2.
    const answered = await ok(as.post('/api/tutorial/challenge', { challenge: 'too_many' }));
    expect(answered).toMatchObject({
      state: 'active',
      challenge: 'too_many',
      limitLowered: 2,
      step: { key: 'tutorial.area', xp: 20, replay: false },
    });
    expect((await as.get('/api/me')).body.settings.activeProjectLimit).toBe(2);
    // Tutorial steps show in Streaky's card, and on the quest board as type `tutorial`.
    const board = (await as.get('/api/quests')).body.quests;
    expect(board.filter((q: { type: string }) => q.type === 'tutorial')).toHaveLength(1);

    // 1. An area: the write's game block says the step is done; the next one is open.
    const area = await as.post('/api/areas', { title: 'University' });
    expect(area.body.game.questsDone).toEqual([
      expect.objectContaining({ type: 'tutorial', title: 'Create an area', xp: 20 }),
    ]);
    expect((await tour()).step.key).toBe('tutorial.project');

    // 2. A project.
    const project = await ok(
      as.post('/api/projects', { title: 'Calculus', areaId: area.body.id }),
      201,
    );
    expect((await tour()).step.key).toBe('tutorial.task');

    // 3. A task in a project (an inbox task wouldn't do).
    await ok(as.post('/api/tasks', { title: 'Loose idea' }), 201);
    expect((await tour()).step.key).toBe('tutorial.task');
    const task = await ok(
      as.post('/api/tasks', { title: 'Chapter 1', projectId: project.id }),
      201,
    );
    expect((await tour()).step.key).toBe('tutorial.complete');

    // 4. Complete it.
    await ok(as.post(`/api/tasks/${task.id}/complete`));
    expect((await tour()).step).toMatchObject({ key: 'tutorial.focus', xp: 50, boxTier: 'large' });

    // 5. Ten minutes of focus ends the tour.
    const before = await xp();
    const finished = await focus10();
    expect(finished.game.questsDone).toEqual([
      expect.objectContaining({ type: 'tutorial', xp: 50, boxTier: 'large' }),
    ]);
    expect((await xp()) - before).toBe(10 + 50); // the minutes, plus the step
    expect(await tour()).toMatchObject({ state: 'done', step: null });

    expect(await ok(as.post('/api/tutorial/close'))).toMatchObject({ state: 'closed' });
  });

  it('skips a step without a reward, and can be put away', async () => {
    await ok(as.post('/api/tutorial/start'));
    await ok(as.post('/api/tutorial/challenge', { challenge: null }));
    expect(await ok(as.post('/api/tutorial/skip'))).toMatchObject({
      step: { key: 'tutorial.project' },
    });
    expect(await xp()).toBe(0);
    expect(await ok(as.post('/api/tutorial/close'))).toMatchObject({ state: 'closed', step: null });
    // The closed tour's step is gone from the board.
    const board = (await as.get('/api/quests')).body.quests;
    expect(board.some((q: { type: string }) => q.type === 'tutorial')).toBe(false);
    expect((await as.post('/api/tutorial/skip')).status).toBe(409);
  });

  it('pays each step once: taken again, a step already rewarded is worth nothing', async () => {
    await ok(as.post('/api/tutorial/start'));
    await ok(as.post('/api/tutorial/challenge', { challenge: 'forgetting' }));
    await ok(as.post('/api/areas', { title: 'Work' }), 201);
    expect(await xp()).toBe(20);

    // Again, from Settings: the question first, then the area step as a replay.
    await ok(as.post('/api/tutorial/start'));
    const again = await ok(as.post('/api/tutorial/challenge', { challenge: 'forgetting' }));
    expect(again.step).toMatchObject({ key: 'tutorial.area', xp: 0, replay: true });
    const area = await as.post('/api/areas', { title: 'Health' });
    expect(area.body.game.questsDone[0]).toMatchObject({ type: 'tutorial', xp: 0 });
    expect(await xp()).toBe(20);
    // The project step was never rewarded, so it still pays.
    expect((await tour()).step).toMatchObject({ key: 'tutorial.project', xp: 20 });
  });

  it('only asks while it’s asking', async () => {
    expect((await as.post('/api/tutorial/challenge', { challenge: 'motivation' })).status).toBe(
      409,
    );
    expect((await as.post('/api/tutorial/challenge', { challenge: 'nope' })).status).toBe(400);
  });
});

describe('the challenge in Settings (D36)', () => {
  it('saves the answer, and "too many projects" lowers the limit only when it’s higher', async () => {
    const res = await ok(as.patch('/api/settings', { challenge: 'too_many' }));
    expect(res).toMatchObject({ challenge: 'too_many', activeProjectLimit: 2 });

    await ok(as.patch('/api/settings', { activeProjectLimit: 5, challenge: 'next_step' }));
    // Set together with a limit, the limit wins.
    const both = await ok(
      as.patch('/api/settings', { challenge: 'too_many', activeProjectLimit: 4 }),
    );
    expect(both).toMatchObject({ challenge: 'too_many', activeProjectLimit: 4 });

    await ok(as.patch('/api/settings', { challenge: null, activeProjectLimit: 1 }));
    expect(await ok(as.patch('/api/settings', { challenge: 'too_many' }))).toMatchObject({
      activeProjectLimit: 1,
    });
  });
});
