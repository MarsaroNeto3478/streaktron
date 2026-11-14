// Loot boxes and the collection (plan.md §4.9, D11, D48). A quest that earned a box gets exactly one
// (unique on the quest); rarity and item are rolled server-side with crypto randomness when the box
// is opened, and kept. Granting reconciles from the quests table, so boxes for quests completed
// before this phase arrive the first time it runs (retroactive), and never twice.

import { randomInt } from 'node:crypto';
import { openBox, type Rarity } from '@strekatron/shared/collectibles';
import type { BoxTier } from '@strekatron/shared/game';
import { newId } from '@strekatron/shared/ids';
import { and, asc, count, eq, inArray, isNotNull, isNull, min, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { inventoryItems, lootBoxes, quests, userSettings } from '../db/schema';
import { conflict, notFound, type Tx } from './common';

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * Grant the boxes earned and not granted yet; returns how many. A completed quest earns one, except
 * replays (worth nothing, D15). A make quest's box waits for its follow-up (D16): granted when the
 * follow-up is done or expires with the item still there, never when it's cancelled (item deleted).
 */
export async function grantBoxes(tx: Tx, userId: string): Promise<number> {
  const done = await tx
    .select({ id: quests.id, tier: quests.boxTier, closedAt: quests.closedAt })
    .from(quests)
    .leftJoin(lootBoxes, eq(lootBoxes.questId, quests.id))
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.status, 'completed'),
        isNull(lootBoxes.id),
        sql`${quests.params} ->> 'replay' is null`,
      ),
    )
    .orderBy(asc(quests.closedAt), asc(quests.id));
  if (!done.length) return 0;
  const followUps = new Map(
    (
      await tx
        .select({ parent: quests.parentQuestId, status: quests.status, closedAt: quests.closedAt })
        .from(quests)
        .where(
          and(
            eq(quests.userId, userId),
            eq(quests.type, 'follow_up'),
            inArray(
              quests.parentQuestId,
              done.map((d) => d.id),
            ),
          ),
        )
    ).map((f) => [f.parent, f]),
  );

  let granted = 0;
  for (const q of done) {
    let earnedAt = q.closedAt ?? new Date();
    const f = followUps.get(q.id);
    if (f) {
      if (f.status !== 'completed' && f.status !== 'expired') continue;
      earnedAt = f.closedAt ?? earnedAt;
    }
    const added = await tx
      .insert(lootBoxes)
      .values({ id: newId('lootBox'), userId, questId: q.id, tier: q.tier, earnedAt })
      .onConflictDoNothing()
      .returning({ id: lootBoxes.id });
    granted += added.length;
  }
  return granted;
}

/** The user's settings row, locked: opening boxes runs one at a time per user. */
async function lockUser(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .for('update');
  if (!row) throw notFound('user');
}

const boxView = (b: { id: string; tier: BoxTier; earnedAt: Date; questTitle: string | null }) => ({
  id: b.id,
  tier: b.tier,
  earnedAt: b.earnedAt,
  questTitle: b.questTitle,
});

/** Unopened boxes, oldest first. */
export async function lootView(userId: string) {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await grantBoxes(tx, userId);
    const rows = await tx
      .select({
        id: lootBoxes.id,
        tier: lootBoxes.tier,
        earnedAt: lootBoxes.earnedAt,
        questTitle: quests.title,
      })
      .from(lootBoxes)
      .leftJoin(quests, eq(quests.id, lootBoxes.questId))
      .where(and(eq(lootBoxes.userId, userId), isNull(lootBoxes.openedAt)))
      .orderBy(asc(lootBoxes.earnedAt), asc(lootBoxes.id));
    return { unopened: rows.map(boxView) };
  });
}

/** What the user owns: each collectible's copies and when the first arrived. */
export async function collectionView(userId: string) {
  const owned = await db
    .select({
      key: inventoryItems.itemKey,
      count: count(),
      firstAt: min(inventoryItems.acquiredAt),
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.userId, userId))
    .groupBy(inventoryItems.itemKey)
    .orderBy(asc(inventoryItems.itemKey));
  const [opened] = await db
    .select({ n: count() })
    .from(lootBoxes)
    .where(and(eq(lootBoxes.userId, userId), isNotNull(lootBoxes.openedAt)));
  return { owned: owned.map((o) => ({ ...o, firstAt: o.firstAt! })), opened: opened?.n ?? 0 };
}

/**
 * Open boxes (`ids`, or every unopened one), oldest first. The pity rules read every box opened
 * before, in the order they were opened.
 */
export async function openBoxes(userId: string, ids: string[] | 'all') {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await grantBoxes(tx, userId);
    const boxes = await tx
      .select({ id: lootBoxes.id, tier: lootBoxes.tier, openedAt: lootBoxes.openedAt })
      .from(lootBoxes)
      .where(
        and(
          eq(lootBoxes.userId, userId),
          ids === 'all' ? isNull(lootBoxes.openedAt) : inArray(lootBoxes.id, ids),
        ),
      )
      .orderBy(asc(lootBoxes.earnedAt), asc(lootBoxes.id));
    if (ids !== 'all') {
      if (boxes.length !== ids.length) throw notFound('loot box');
      if (boxes.some((b) => b.openedAt)) {
        throw conflict('already_opened', 'That box is already open.');
      }
    }

    const history = (
      await tx
        .select({ rarity: lootBoxes.rarity })
        .from(lootBoxes)
        .where(and(eq(lootBoxes.userId, userId), isNotNull(lootBoxes.openedAt)))
        .orderBy(asc(lootBoxes.openedAt), asc(lootBoxes.id))
    ).map((r) => r.rarity as Rarity);

    const opened = [];
    for (const b of boxes) {
      const { rarity, item } = openBox(b.tier, history, rng);
      history.push(rarity);
      const now = new Date();
      await tx
        .update(lootBoxes)
        .set({ openedAt: now, itemKey: item.key, rarity })
        .where(eq(lootBoxes.id, b.id));
      // How many the user had before this one: the reveal says "New!" for a first copy.
      const [had] = await tx
        .select({ n: count() })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemKey, item.key)));
      await tx.insert(inventoryItems).values({
        id: newId('inventoryItem'),
        userId,
        itemKey: item.key,
        acquiredAt: now,
        lootBoxId: b.id,
      });
      opened.push({ boxId: b.id, tier: b.tier, rarity, itemKey: item.key, isNew: !had?.n });
    }
    return { opened };
  });
}
