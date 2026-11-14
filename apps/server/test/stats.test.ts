import { newId } from '@strekatron/shared/ids';
import { addDays } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, quests, userSettings } from '../src/db/schema';
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

const focus = (localDate: string, minutes: number, projectId: string | null) =>
  db.insert(activity).values({
    id: newId('activity'),
    userId,
    type: 'focus_completed',
    entityId: newId('focusSession'),
    localDate,
    occurredAt: new Date(`${localDate}T12:00:00Z`),
    payload: { minutes, projectId, taskId: null },
  });

const pastQuest = (type: 'daily' | 'quick', status: 'completed' | 'expired') =>
  db.insert(quests).values({
    id: newId('quest'),
    userId,
    type,
    templateKey: `${type}.x`,
    title: 'A quest',
    periodStart: addDays(today, -2),
    periodEnd: addDays(today, -2),
    target: 1,
    rewardXp: 20,
    boxTier: 'standard',
    status,
  });

describe('stats overview (D50)', () => {
  it('names focus by project and area, and counts quest outcomes', async () => {
    const area = (await as.post('/api/areas', { title: 'University' })).body;
    const p = (await as.post('/api/projects', { title: 'Thesis', areaId: area.id })).body;
    await focus(today, 50, p.id);
    await focus(addDays(today, -1), 25, null);
    await pastQuest('daily', 'completed');
    await pastQuest('daily', 'completed');
    await pastQuest('daily', 'expired');
    await pastQuest('quick', 'completed');

    const res = await as.get('/api/stats/overview?weeks=4');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.weeks).toHaveLength(4);
    expect(res.body.totals.focusMinutes).toBe(75);
    expect(res.body.focusByProject).toEqual([
      { projectId: p.id, title: 'Thesis', color: p.color, areaId: area.id, minutes: 50 },
      { projectId: null, title: 'No project', color: null, areaId: null, minutes: 25 },
    ]);
    expect(res.body.focusByArea.map((a: { title: string }) => a.title)).toEqual([
      'University',
      'No area',
    ]);
    expect(res.body.quests).toEqual([
      { type: 'daily', completed: 2, expired: 1 },
      { type: 'quick', completed: 1, expired: 0 },
    ]);
    expect((await as.get('/api/stats/overview?weeks=5')).status).toBe(400);
  });
});
