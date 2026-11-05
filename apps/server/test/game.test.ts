import { newId } from '@streaktron/shared/ids';
import { addDays } from '@streaktron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, focusSessions, quests, users, userSettings } from '../src/db/schema';
import { client, request, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
});

const newProject = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/projects', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
};
const newTask = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/tasks', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; columnId: string | null; game?: GameBlock };
};

interface GameBlock {
  xp: number;
  levelUp: { from: number; to: number } | null;
  streak: { from: number; to: number } | null;
  questsDone: { id: string; type: string; title: string; xp: number }[];
  questsAdded: { id: string; title: string }[];
  state: { xp: number; level: { level: number }; daily: { current: number } };
}

const activities = (type?: string) =>
  db
    .select()
    .from(activity)
    .where(
      type
        ? and(eq(activity.userId, userId), eq(activity.type, type as never))
        : eq(activity.userId, userId),
    );

/** Back-date the log, as if these things had happened on other days. */
async function shiftActivityDays(days: number) {
  const rows = await activities();
  for (const r of rows) {
    await db
      .update(activity)
      .set({
        localDate: addDays(r.localDate, days),
        occurredAt: new Date(r.occurredAt.getTime() + days * 86_400_000),
      })
      .where(eq(activity.id, r.id));
  }
}

/** Turn off every quest type but these, so tests see only the quests they're about. */
async function onlyQuests(...keep: string[]) {
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

describe('activity and XP', () => {
  it('logs completions and earns XP once per task (D15)', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const p = await newProject('Thesis');
    const t = await newTask('Write intro', { projectId: p.id, effort: 'M' });

    const done = await as.post(`/api/tasks/${t.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('done');
    expect(done.body.game).toMatchObject({ xp: 25, streak: { from: 0, to: 1 } });
    expect(done.body.game.state).toMatchObject({ xp: 25, daily: { current: 1 } });

    const reopened = await as.post(`/api/tasks/${t.id}/reopen`);
    expect(reopened.body.game?.xp ?? 0).toBe(0);
    const again = await as.post(`/api/tasks/${t.id}/complete`);
    expect(again.body.game.xp).toBe(0);
    expect(again.body.game.state.xp).toBe(25);

    const types = (await activities()).map((a) => a.type).sort();
    // The project and the task were made (the tutorial reads projects), then the completions.
    expect(types).toEqual([
      'item_created',
      'item_created',
      'task_completed',
      'task_completed',
      'task_reopened',
    ]);
    // Deleting doesn't take XP away.
    await as.del(`/api/tasks/${t.id}`);
    expect((await as.get('/api/game/state')).body.xp).toBe(25);
  });

  it('counts board moves and column changes as completions', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const p = await newProject('Game');
    const t = await newTask('Sprite', { projectId: p.id, effort: 'L' });
    const { body: page } = await as.get(`/api/projects/${p.id}`);
    const doneCol = page.columns.find((c: { category: string }) => c.category === 'done');
    const todo = page.columns.find((c: { category: string }) => c.category === 'todo');

    const moved = await as.post(`/api/tasks/${t.id}/move`, { columnId: doneCol.id, index: 0 });
    expect(moved.body.game.xp).toBe(50);
    await as.post(`/api/tasks/${t.id}/move`, { columnId: todo.id, index: 0 });
    expect((await activities('task_reopened')).length).toBe(1);

    // Turning the to-do column into a done one completes what's in it (and logs it).
    const t2 = await newTask('Music', { projectId: p.id });
    const flip = await as.patch(`/api/columns/${todo.id}`, { category: 'done' });
    expect(flip.status, JSON.stringify(flip.body)).toBe(200);
    expect(flip.body.game.xp).toBe(10);
    const completions = (await activities('task_completed')).map((a) => a.entityId);
    expect(completions).toContain(t2.id);
    expect((await as.get('/api/game/state')).body.xp).toBe(60); // Sprite once (50) + Music (S: 10)
  });

  it('gives subtasks no XP but counts them for the day', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const p = await newProject('P');
    const parent = await newTask('Parent', { projectId: p.id });
    const sub = await newTask('Sub', { parentTaskId: parent.id });
    const res = await as.post(`/api/tasks/${sub.id}/complete`);
    expect(res.body.game).toMatchObject({ xp: 0, streak: { from: 0, to: 1 } });
  });

  it('logs the user’s day, not the server’s', async () => {
    const t = await newTask('Inbox thing');
    await as.post(`/api/tasks/${t.id}/complete`);
    const [row] = await activities('task_completed');
    expect(row!.localDate).toBe((await as.get('/api/me')).body.today);
  });

  it('keeps the streak through a missed day with a banked freeze', async () => {
    // Seven days in a row, a week ago, then a gap of one day before yesterday… shifted into place.
    const today = (await as.get('/api/me')).body.today as string;
    const rows = [];
    for (let i = 9; i >= 3; i--) rows.push(addDays(today, -i)); // 7 days
    rows.push(addDays(today, -1)); // today-2 missed
    for (const day of rows) {
      await db.insert(activity).values({
        id: newId('activity'),
        userId,
        type: 'task_completed',
        entityId: newId('task'),
        localDate: day,
        occurredAt: new Date(`${day}T15:00:00Z`),
        payload: { effort: 'S', projectId: null, subtask: false },
      });
    }
    const { body } = await as.get('/api/game/state');
    expect(body.daily).toMatchObject({ current: 8, freezes: 0, frozenDays: [addDays(today, -2)] });
  });
});

describe('quests', () => {
  it('builds today’s and this week’s boards once', async () => {
    const p = await newProject('Thesis');
    await newTask('Outline', { projectId: p.id });
    // Making the project already built a board (before the task existed); start from none.
    await db.delete(quests).where(eq(quests.userId, userId));
    const first = await as.get('/api/quests');
    expect(first.status).toBe(200);
    const types = first.body.quests.map((q: { type: string }) => q.type);
    expect(types.filter((t: string) => t === 'daily').length).toBe(3);
    expect(types).toContain('time');
    expect(types).toContain('weekly');
    const again = await as.get('/api/quests');
    expect(again.body.quests.map((q: { id: string }) => q.id)).toEqual(
      first.body.quests.map((q: { id: string }) => q.id),
    );
  });

  it('completes quests from writes and reports them in the game block', async () => {
    await onlyQuests('daily');
    const p = await newProject('Thesis');
    // Force a known board: "Complete 2 tasks".
    await as.get('/api/quests');
    await db.delete(quests).where(eq(quests.userId, userId));
    const today = (await as.get('/api/me')).body.today;
    await db.insert(quests).values({
      id: newId('quest'),
      userId,
      type: 'daily',
      templateKey: 'daily.two_tasks',
      title: 'Complete 2 tasks',
      periodStart: today,
      periodEnd: today,
      target: 2,
      rewardXp: 20,
      boxTier: 'standard',
    });
    const a = await newTask('A', { projectId: p.id });
    const b = await newTask('B', { projectId: p.id });
    const first = await as.post(`/api/tasks/${a.id}/complete`);
    expect(first.body.game.questsDone).toEqual([]);
    const second = await as.post(`/api/tasks/${b.id}/complete`);
    // The quest (20) plus the board bonus: it was the only daily quest.
    expect(second.body.game.questsDone).toMatchObject([{ title: 'Complete 2 tasks', xp: 20 }]);
    expect(second.body.game.xp).toBe(10 + 20 + 25);
    expect((await activities('quest_completed')).length).toBe(1);
    expect((await activities('quest_bonus')).length).toBe(1);

    const board = await as.get('/api/quests');
    expect(board.body.quests[0]).toMatchObject({ status: 'completed', progress: 2 });
  });

  it('a make quest spawns a follow-up for the new item, done with 2 details (D16)', async () => {
    await onlyQuests();
    const p = await newProject('Thesis');
    const today = (await as.get('/api/me')).body.today;
    await as.get('/api/quests');
    const makeId = newId('quest');
    await db.insert(quests).values({
      id: makeId,
      userId,
      type: 'make',
      templateKey: 'make.task',
      title: 'Add a task to “Thesis”',
      periodStart: today,
      periodEnd: today,
      target: 1,
      rewardXp: 15,
      boxTier: 'standard',
      targetEntityId: p.id,
      params: { projectId: p.id },
      offeredAt: new Date(Date.now() - 1000),
    });
    const made = await newTask('Collect sources', { projectId: p.id });
    expect(made.game?.questsDone).toMatchObject([{ id: makeId, xp: 15 }]);
    expect(made.game?.questsAdded).toMatchObject([{ title: 'Add details to “Collect sources”' }]);
    const [follow] = await db
      .select()
      .from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.type, 'follow_up')));
    expect(follow).toMatchObject({
      parentQuestId: makeId,
      target: 2,
      periodEnd: addDays(today, 1),
    });
    // The project has no goals, so "a goal" isn't asked for.
    expect(follow!.params.missing).toEqual(['description', 'effort', 'date', 'subtasks']);

    const one = await as.patch(`/api/tasks/${made.id}`, { effort: 'M' });
    expect(one.body.game?.questsDone ?? []).toEqual([]);
    const two = await as.patch(`/api/tasks/${made.id}`, { dueDate: addDays(today, 3) });
    expect(two.body.game.questsDone).toMatchObject([{ type: 'follow_up', xp: 15 }]);
  });

  it('counts a task moved from the inbox into the project for “Add a task to X”', async () => {
    await onlyQuests();
    const p = await newProject('Thesis');
    const today = (await as.get('/api/me')).body.today;
    await as.get('/api/quests');
    const makeId = newId('quest');
    await db.insert(quests).values({
      id: makeId,
      userId,
      type: 'make',
      templateKey: 'make.task',
      title: 'Add a task to “Thesis”',
      periodStart: today,
      periodEnd: today,
      target: 1,
      rewardXp: 15,
      boxTier: 'standard',
      targetEntityId: p.id,
      params: { projectId: p.id },
      offeredAt: new Date(Date.now() - 1000),
    });
    const inbox = await newTask('Read chapter 2');
    expect(inbox.game?.questsDone ?? []).toEqual([]);
    const moved = await as.patch(`/api/tasks/${inbox.id}`, { projectId: p.id });
    expect(moved.status).toBe(200);
    expect(moved.body.game?.questsDone).toMatchObject([{ id: makeId, xp: 15 }]);
    expect(moved.body.game?.questsAdded).toMatchObject([
      { title: 'Add details to “Read chapter 2”' },
    ]);
  });

  it('cancels a follow-up when its item is deleted', async () => {
    await onlyQuests();
    const p = await newProject('Thesis');
    const today = (await as.get('/api/me')).body.today;
    await as.get('/api/quests');
    await db.insert(quests).values({
      id: newId('quest'),
      userId,
      type: 'make',
      templateKey: 'make.task',
      title: 'Add a task',
      periodStart: today,
      periodEnd: today,
      target: 1,
      rewardXp: 15,
      boxTier: 'standard',
      targetEntityId: p.id,
      params: { projectId: p.id },
      offeredAt: new Date(Date.now() - 1000),
    });
    const made = await newTask('Doomed', { projectId: p.id });
    await as.del(`/api/tasks/${made.id}`);
    const [follow] = await db.select().from(quests).where(eq(quests.type, 'follow_up'));
    expect(follow!.status).toBe('cancelled');
  });

  it('rerolls once, into a quest of the same type', async () => {
    await onlyQuests('daily');
    for (const title of ['A', 'B', 'C']) {
      const p = await newProject(title);
      await newTask(`Task of ${title}`, { projectId: p.id });
    }
    const { body } = await as.get('/api/quests');
    const q = body.quests.find((x: { type: string }) => x.type === 'daily');
    expect(q.canReroll).toBe(true);
    const res = await as.post(`/api/quests/${q.id}/reroll`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.type).toBe('daily');
    expect(res.body.canReroll).toBe(false);
    expect((await as.post(`/api/quests/${res.body.id}/reroll`)).status).toBe(409);
    expect((await as.post(`/api/quests/${q.id}/reroll`)).status).toBe(409);
    const after = await as.get('/api/quests');
    expect(after.body.quests.map((x: { id: string }) => x.id)).not.toContain(q.id);
  });

  it('expires yesterday’s quests and makes a new board', async () => {
    await as.get('/api/quests');
    await db
      .update(quests)
      .set({ periodStart: '2020-01-01', periodEnd: '2020-01-01' })
      .where(eq(quests.userId, userId));
    const { body } = await as.get('/api/quests');
    expect(body.quests.length).toBeGreaterThan(0);
    const old = await db.select().from(quests).where(eq(quests.periodStart, '2020-01-01'));
    expect(old.every((q) => q.status === 'expired')).toBe(true);
  });

  it('only offers the comeback quest after a week away', async () => {
    const t = await newTask('Old');
    await as.post(`/api/tasks/${t.id}/complete`);
    await shiftActivityDays(-10);
    await db.delete(quests).where(eq(quests.userId, userId));
    const { body } = await as.get('/api/quests');
    expect(body.quests.map((q: { type: string }) => q.type)).toEqual(['comeback']);
  });

  it('hides other accounts’ quests', async () => {
    const other = newId('user');
    await db.insert(users).values({ id: other, name: 'Eve', email: 'eve@example.com' });
    const id = newId('quest');
    await db.insert(quests).values({
      id,
      userId: other,
      type: 'daily',
      templateKey: 'daily.two_tasks',
      title: 'x',
      periodStart: '2030-01-01',
      periodEnd: '2030-01-01',
      target: 2,
      rewardXp: 20,
      boxTier: 'standard',
    });
    expect((await as.post(`/api/quests/${id}/reroll`)).status).toBe(404);
  });
});

describe('focus sessions', () => {
  it('runs, pauses, resumes and finishes, crediting worked minutes', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const p = await newProject('Thesis');
    const t = await newTask('Read', { projectId: p.id });
    const start = await as.post('/api/focus/start', { plannedMinutes: 25, taskId: t.id });
    expect(start.status).toBe(201);
    expect(start.body).toMatchObject({
      status: 'running',
      task: { id: t.id },
      project: { id: p.id },
    });
    expect((await as.post('/api/focus/start', { plannedMinutes: 25 })).status).toBe(409);

    const id = start.body.id;
    expect((await as.get('/api/focus/current')).body.session.id).toBe(id);
    // Pretend it started 30 minutes ago with 2 minutes of pauses.
    await db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - 30 * 60_000), pausedMs: 2 * 60_000 })
      .where(eq(focusSessions.id, id));
    expect((await as.post(`/api/focus/${id}/pause`)).body.status).toBe('paused');
    expect((await as.post(`/api/focus/${id}/resume`)).body.status).toBe('running');

    const done = await as.post(`/api/focus/${id}/finish`, { note: 'Good one', completeTask: true });
    expect(done.status).toBe(200);
    // 28 worked, capped at the planned 25.
    expect(done.body.session).toMatchObject({ status: 'completed', minutes: 25, note: 'Good one' });
    expect(done.body.task).toMatchObject({ id: t.id, status: 'done' });
    expect(done.body.game.xp).toBe(25 + 10);
    expect((await as.get('/api/focus/current')).body.session).toBeNull();
    expect((await as.post(`/api/focus/${id}/finish`, {})).status).toBe(409);
  });

  it('short sessions count minutes but no XP; abandoned ones nothing', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const s = await as.post('/api/focus/start', { plannedMinutes: 25 });
    await db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(focusSessions.id, s.body.id));
    const done = await as.post(`/api/focus/${s.body.id}/finish`, {});
    expect(done.body.session.minutes).toBe(5);
    expect(done.body.game?.xp ?? 0).toBe(0);

    const a = await as.post('/api/focus/start', { plannedMinutes: 50 });
    expect((await as.post(`/api/focus/${a.body.id}/abandon`)).body.status).toBe('abandoned');
    expect((await activities('focus_completed')).length).toBe(1);
  });

  it('validates', async () => {
    expect((await as.post('/api/focus/start', { plannedMinutes: 0 })).status).toBe(400);
    expect(
      (await as.post('/api/focus/start', { plannedMinutes: 25, taskId: newId('task') })).status,
    ).toBe(404);
  });
});

describe('today', () => {
  it('lists overdue, due, scheduled, then next actions; parked projects stay quiet', async () => {
    const today = (await as.get('/api/me')).body.today;
    const a = await newProject('Active');
    const parked = await newProject('Parked', { status: 'parked' });
    await newTask('Next one', { projectId: a.id });
    await newTask('Due today', { projectId: a.id, dueDate: today });
    await newTask('Overdue', { dueDate: addDays(today, -2) });
    await newTask('Scheduled', { scheduledDate: today });
    await newTask('Parked overdue', { projectId: parked.id, dueDate: addDays(today, -1) });
    await newTask('Later', { dueDate: addDays(today, 5) });

    const { body } = await as.get('/api/today');
    expect(
      body.focus.map((i: { task: { title: string }; reason: string }) => [i.reason, i.task.title]),
    ).toEqual([
      ['overdue', 'Overdue'],
      ['due', 'Due today'],
      ['scheduled', 'Scheduled'],
      ['next', 'Next one'],
    ]);
  });
});

describe('settings', () => {
  it('changes the day once a week, the rest any time', async () => {
    const first = await as.patch('/api/settings', { timezone: 'Europe/Lisbon', dayStartHour: 5 });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ timezone: 'Europe/Lisbon', dayStartHour: 5 });
    const locked = await as.patch('/api/settings', { timezone: 'Asia/Tokyo' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('day_settings_locked');
    // Not a change: fine.
    expect((await as.patch('/api/settings', { timezone: 'Europe/Lisbon' })).status).toBe(200);
    const other = await as.patch('/api/settings', {
      weekStart: 0,
      weeklyActiveDayTarget: 5,
      focusPresets: [{ focusMinutes: 45, breakMinutes: 15 }],
      questSettings: { restingTypes: ['make'], timeQuestMinMinutes: 20, timeQuestMaxMinutes: 120 },
    });
    expect(other.status).toBe(200);
    expect(other.body.questSettings.restingTypes).toEqual(['make']);
    expect(
      (
        await as.patch('/api/settings', {
          questSettings: {
            restingTypes: ['comeback'],
            timeQuestMinMinutes: 20,
            timeQuestMaxMinutes: 120,
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await as.patch('/api/settings', {
          questSettings: { restingTypes: [], timeQuestMinMinutes: 200, timeQuestMaxMinutes: 120 },
        })
      ).status,
    ).toBe(400);
  });
});

describe('stats and admin', () => {
  it('heatmap: a day per day with activity', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const t = await newTask('A', { effort: 'L' });
    await as.post(`/api/tasks/${t.id}/complete`);
    const today = (await as.get('/api/me')).body.today;
    const { body } = await as.get(`/api/stats/heatmap?from=${addDays(today, -30)}&to=${today}`);
    expect(body.days).toEqual([{ date: today, active: true, focusMinutes: 0, tasks: 1, xp: 50 }]);
    expect((await as.get(`/api/stats/heatmap?from=${today}&to=${addDays(today, -1)}`)).status).toBe(
      400,
    );
  });

  it('recompute returns the state from the log', async () => {
    await onlyQuests(); // exact XP: no quests in the way
    const t = await newTask('A', { effort: 'M' });
    await as.post(`/api/tasks/${t.id}/complete`);
    const res = await as.post('/api/admin/recompute');
    expect(res.body.state.xp).toBe(25);
  });

  it('needs a session', async () => {
    for (const path of ['/api/game/state', '/api/quests', '/api/today', '/api/focus/current']) {
      expect((await request(path)).status, path).toBe(401);
    }
  });
});
