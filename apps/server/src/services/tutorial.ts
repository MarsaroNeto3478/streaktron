// Streaky's tour (D31) and question (D32, D36). The tour is a chain of tutorial quests: starting it
// asks the challenge question first, answering (or skipping) opens the first step, and each step
// done or skipped opens the next (game.ts `advanceTutorial`). The state lives on the settings row.

import { GAME, isTutorialStep, type Challenge, type TutorialState } from '@streaktron/shared/game';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { quests, userSettings } from '../db/schema';
import { dayOf } from './activity';
import { conflict, notFound, type Tx } from './common';
import { advanceTutorial, evaluateAll } from './game';

type SettingsRow = typeof userSettings.$inferSelect;

/**
 * What answering `challenge` changes besides the answer itself: "too many projects" lowers the
 * active-project limit to 2 (never raises it), unless the same patch sets the limit itself.
 */
export function challengeTuning(
  current: Pick<SettingsRow, 'activeProjectLimit' | 'challenge'>,
  challenge: Challenge | null | undefined,
  limitInPatch?: number,
): Partial<Pick<SettingsRow, 'activeProjectLimit'>> {
  const limit = GAME.challenge.activeProjectLimit;
  if (challenge !== 'too_many' || current.challenge === 'too_many') return {};
  if (limitInPatch !== undefined || current.activeProjectLimit <= limit) return {};
  return { activeProjectLimit: limit };
}

async function lock(tx: Tx, userId: string): Promise<SettingsRow> {
  const [row] = await tx
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .for('update');
  if (!row) throw notFound('user');
  return row;
}

const setState = (tx: Tx, userId: string, tutorial: TutorialState) =>
  tx.update(userSettings).set({ tutorial }).where(eq(userSettings.userId, userId));

/** Close the tour's open step (when the tour is put away or started over). */
const cancelOpenSteps = (tx: Tx, userId: string) =>
  tx
    .update(quests)
    .set({ status: 'cancelled', closedAt: new Date() })
    .where(
      and(eq(quests.userId, userId), eq(quests.type, 'tutorial'), eq(quests.status, 'offered')),
    );

async function openStep(tx: Tx, userId: string) {
  const [row] = await tx
    .select()
    .from(quests)
    .where(
      and(eq(quests.userId, userId), eq(quests.type, 'tutorial'), eq(quests.status, 'offered')),
    )
    .limit(1);
  return row ?? null;
}

/** The tour as Today shows it. Viewing brings the open step's progress up to date. */
export async function getTutorial(userId: string) {
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!s) throw notFound('user');
  if (s.tutorial === 'active') await evaluateAll(userId);
  return db.transaction(async (tx) => {
    const row = await lock(tx, userId);
    const step = row.tutorial === 'active' ? await openStep(tx, userId) : null;
    return {
      state: row.tutorial,
      challenge: row.challenge,
      step: step
        ? {
            id: step.id,
            key: step.templateKey,
            title: step.title,
            xp: step.rewardXp,
            boxTier: step.boxTier,
            replay: !!step.params.replay,
          }
        : null,
    };
  });
}

/** Start the tour (or take it again): Streaky asks his question first. */
export async function startTutorial(userId: string) {
  await db.transaction(async (tx) => {
    await lock(tx, userId);
    await cancelOpenSteps(tx, userId);
    await setState(tx, userId, 'question');
  });
  return getTutorial(userId);
}

/** Answer the question (null: skip it); the first step opens. */
export async function answerChallenge(userId: string, challenge: Challenge | null) {
  const tuned = await db.transaction(async (tx) => {
    const s = await lock(tx, userId);
    if (s.tutorial !== 'question') {
      throw conflict('tutorial_state', 'Streaky isn’t asking that right now.');
    }
    const tuning = challengeTuning(s, challenge);
    await tx
      .update(userSettings)
      .set({ challenge, tutorial: 'active', ...tuning })
      .where(eq(userSettings.userId, userId));
    await advanceTutorial(tx, userId, null, dayOf(s));
    return tuning;
  });
  return { ...(await getTutorial(userId)), limitLowered: tuned.activeProjectLimit ?? null };
}

/** Skip the open step (no reward); the next one opens, or the tour ends. */
export async function skipStep(userId: string) {
  await db.transaction(async (tx) => {
    const s = await lock(tx, userId);
    const step = s.tutorial === 'active' ? await openStep(tx, userId) : null;
    if (!step || !isTutorialStep(step.templateKey)) {
      throw conflict('tutorial_state', 'There’s no step to skip.');
    }
    await cancelOpenSteps(tx, userId);
    await advanceTutorial(tx, userId, step.templateKey, dayOf(s));
  });
  return getTutorial(userId);
}

/** Put the tour away ("Not now", "End the tour", or "Thanks" once it's done). */
export async function closeTutorial(userId: string) {
  await db.transaction(async (tx) => {
    await lock(tx, userId);
    await cancelOpenSteps(tx, userId);
    await setState(tx, userId, 'closed');
  });
  return getTutorial(userId);
}
