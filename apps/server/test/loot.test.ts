import { RARITIES, collectible, type Rarity } from '@strekatron/shared/collectibles';
import { newId } from '@strekatron/shared/ids';
import { addDays } from '@strekatron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { inventoryItems, lootBoxes, quests, userSettings } from '../src/db/schema';
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
  // No generated quests in the way: these tests make their own.
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

/** A quest that was completed some time ago (before loot existed, say). */
async function completedQuest(extra: Partial<typeof quests.$inferInsert> = {}) {
  const id = newId('quest');
  await db.insert(quests).values({
    id,
    userId,
    type: 'daily',
    templateKey: 'daily.top',
    title: 'Finish your top Today item',
    periodStart: addDays(today, -3),
    periodEnd: addDays(today, -3),
    target: 1,
    progress: 1,
    rewardXp: 30,
    boxTier: 'standard',
    status: 'completed',
    offeredAt: new Date(Date.now() - 3 * 86_400_000),
    closedAt: new Date(Date.now() - 3 * 86_400_000 + 3_600_000),
    ...extra,
  });
  return id;
}

async function makeQuest(projectId: string) {
  const id = newId('quest');
  await db.insert(quests).values({
    id,
    userId,
    type: 'make',
    templateKey: 'make.task',
    title: 'Add a task',
    periodStart: today,
    periodEnd: today,
    target: 1,
    rewardXp: 15,
    boxTier: 'standard',
    targetEntityId: projectId,
    params: { projectId },
    offeredAt: new Date(Date.now() - 1000),
  });
  return id;
}

const boxes = () => db.select().from(lootBoxes).where(eq(lootBoxes.userId, userId));

describe('loot boxes (D11, D48)', () => {
  it('grants one box per quest already completed, exactly once (retroactive)', async () => {
    const a = await completedQuest();
    await completedQuest({ type: 'weekly', templateKey: 'weekly.active', boxTier: 'large' });
    // A replay of a tour step earns nothing (D15), so no box either.
    await completedQuest({
      type: 'tutorial',
      templateKey: 'tutorial.area',
      rewardXp: 0,
      params: { replay: true },
    });
    await completedQuest({ status: 'expired' });

    const first = await as.get('/api/loot');
    expect(first.status).toBe(200);
    expect(first.body.unopened.map((b: { tier: string }) => b.tier)).toEqual(['standard', 'large']);
    expect(first.body.unopened[0].questTitle).toBe('Finish your top Today item');
    const again = await as.get('/api/loot');
    expect(again.body.unopened).toHaveLength(2);
    expect(await boxes()).toHaveLength(2);
    const [box] = (await boxes()).filter((b) => b.questId === a);
    const [quest] = await db.select().from(quests).where(eq(quests.id, a));
    expect(box!.earnedAt.getTime()).toBe(quest!.closedAt!.getTime());
  });

  it('opens a box into an item of the collection, once', async () => {
    await completedQuest();
    const { body } = await as.get('/api/loot');
    const id = body.unopened[0].id;

    const opened = await as.post(`/api/loot/${id}/open`);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    const [o] = opened.body.opened;
    expect(o).toMatchObject({ boxId: id, tier: 'standard', isNew: true });
    expect(collectible(o.itemKey)?.rarity).toBe(o.rarity);

    expect((await as.post(`/api/loot/${id}/open`)).status).toBe(409);
    expect((await as.get('/api/loot')).body.unopened).toEqual([]);
    const col = await as.get('/api/collection');
    expect(col.body).toMatchObject({ opened: 1, owned: [{ key: o.itemKey, count: 1 }] });
  });

  it('answers 404 for another account’s box', async () => {
    await completedQuest();
    const id = (await as.get('/api/loot')).body.unopened[0].id;
    await db
      .update(lootBoxes)
      .set({ userId: await otherUser() })
      .where(eq(lootBoxes.id, id));
    expect((await as.post(`/api/loot/${id}/open`)).status).toBe(404);
  });

  it('opens all, oldest first, keeping the pity rules', async () => {
    for (let i = 0; i < 30; i++) {
      await completedQuest({ type: 'quick', templateKey: 'quick.triage', boxTier: 'small' });
    }
    const res = await as.post('/api/loot/open-all');
    expect(res.status).toBe(200);
    const rarities: Rarity[] = res.body.opened.map((o: { rarity: Rarity }) => o.rarity);
    expect(rarities).toHaveLength(30);
    const rank = (r: Rarity) => RARITIES.indexOf(r);
    expect(rarities.some((r) => rank(r) >= rank('epic'))).toBe(true);
    for (let i = 0; i + 10 <= rarities.length; i++) {
      expect(rarities.slice(i, i + 10).some((r) => rank(r) >= rank('rare'))).toBe(true);
    }
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.userId, userId));
    expect(items).toHaveLength(30);
    expect((await as.post('/api/loot/open-all')).body.opened).toEqual([]);
  });

  it('gives a box with the quest done, and a make quest’s box when its follow-up is done (D16)', async () => {
    const p = (await as.post('/api/projects', { title: 'Thesis' })).body;
    await as.get('/api/quests');
    const makeId = await makeQuest(p.id);
    const made = await as.post('/api/tasks', { title: 'Collect sources', projectId: p.id });
    expect(made.body.game.questsDone).toMatchObject([{ id: makeId }]);
    // The make quest's box waits for its follow-up.
    expect(made.body.game.boxesEarned).toBe(0);
    expect(await boxes()).toEqual([]);

    await as.patch(`/api/tasks/${made.body.id}`, { effort: 'M' });
    const done = await as.patch(`/api/tasks/${made.body.id}`, { dueDate: addDays(today, 3) });
    expect(done.body.game.questsDone).toMatchObject([{ type: 'follow_up' }]);
    expect(done.body.game.boxesEarned).toBe(2);
    expect((await boxes()).map((b) => b.tier).sort()).toEqual(['small', 'standard']);
  });

  it('gives no box for a make quest whose item was deleted', async () => {
    const p = (await as.post('/api/projects', { title: 'Thesis' })).body;
    await as.get('/api/quests');
    await makeQuest(p.id);
    const made = await as.post('/api/tasks', { title: 'Doomed', projectId: p.id });
    await as.del(`/api/tasks/${made.body.id}`);
    await as.get('/api/quests');
    const [follow] = await db
      .select()
      .from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.type, 'follow_up')));
    expect(follow!.status).toBe('cancelled');
    expect((await as.get('/api/loot')).body.unopened).toEqual([]);
  });
});

/** A second account, to own things the first can't see. */
async function otherUser() {
  const { users } = await import('../src/db/schema');
  const id = newId('user');
  await db.insert(users).values({
    id,
    name: 'Other',
    email: `${id}@example.test`,
    emailVerified: false,
  });
  return id;
}
