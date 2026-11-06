// The game, server-side (D8, D17): state derived from the activity log, the quest boards, quest
// evaluation after writes, rerolls. Everything for a user runs under a lock on their settings row,
// so two requests can't complete the same quest or build the same board twice.

import { randomInt } from 'node:crypto';
import {
  affectedTemplates,
  eventful,
  filledCount,
  followUpSpec,
  GAME,
  gameEvents,
  gameState,
  madeBy,
  nextTutorialStep,
  planBoard,
  questKey,
  questProgress,
  qualifies,
  rerollable,
  rerollSpec,
  tutorialSpec,
  type Activity,
  type BoardContext,
  type DetailPart,
  type GameEvents,
  type GameState,
  type MadeItem,
  type QuestDone,
  type QuestLike,
  type QuestSpec,
  type Rng,
  xpCredits,
} from '@strekatron/shared/game';
import { newId } from '@strekatron/shared/ids';
import { addDays, startOfWeek, type DateString } from '@strekatron/shared/time';
import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, goals, projects, quests, tasks, userSettings } from '../db/schema';
import { dayOf, recordActivity, type GameScope } from './activity';
import { habitsDueToday } from './habits';
import { conflict, notFound, type Conn, type Tx } from './common';
import { focusList } from './today';

type QuestRow = typeof quests.$inferSelect;
type SettingsRow = typeof userSettings.$inferSelect;

/** An outer column inside a correlated subquery, always table-qualified. */
const outer = (table: string, column: string) => sql.raw(`"${table}"."${column}"`);

/** Crypto-backed randomness for real boards; tests of the rules use seeded ones. */
const cryptoRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

// --- Reading the log -------------------------------------------------------------------------

export async function loadActivities(conn: Conn, userId: string): Promise<Activity[]> {
  const rows = await conn
    .select({
      id: activity.id,
      type: activity.type,
      entityId: activity.entityId,
      localDate: activity.localDate,
      occurredAt: activity.occurredAt,
      payload: activity.payload,
    })
    .from(activity)
    .where(eq(activity.userId, userId))
    .orderBy(asc(activity.occurredAt), asc(activity.id));
  return rows as Activity[];
}

/** The user's settings row, locked until the transaction ends. */
async function lockUser(tx: Tx, userId: string): Promise<SettingsRow> {
  const [row] = await tx
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .for('update');
  if (!row) throw notFound('user');
  return row;
}

const stateOf = (acts: readonly Activity[], s: SettingsRow, today: DateString): GameState =>
  gameState(acts, {
    today,
    weekStart: s.weekStart,
    weeklyActiveDayTarget: s.weeklyActiveDayTarget,
  });

/** XP, level and streaks right now. */
export async function getGameState(userId: string): Promise<GameState> {
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!s) throw notFound('user');
  return stateOf(await loadActivities(db, userId), s, dayOf(s));
}

// --- Boards ----------------------------------------------------------------------------------

const asQuest = (r: QuestRow): QuestLike => ({
  id: r.id,
  type: r.type,
  templateKey: r.templateKey,
  title: r.title,
  periodStart: r.periodStart,
  periodEnd: r.periodEnd,
  target: r.target,
  xp: r.rewardXp,
  boxTier: r.boxTier,
  targetEntityId: r.targetEntityId,
  params: r.params,
  status: r.status,
  offeredAt: r.offeredAt,
});

export async function insertQuest(
  tx: Tx,
  userId: string,
  spec: QuestSpec,
  extra: { parentQuestId?: string; rerollOf?: string } = {},
) {
  const id = newId('quest');
  await tx.insert(quests).values({
    id,
    userId,
    type: spec.type,
    templateKey: spec.templateKey,
    title: spec.title,
    periodStart: spec.periodStart,
    periodEnd: spec.periodEnd,
    target: spec.target,
    rewardXp: spec.xp,
    boxTier: spec.boxTier,
    targetEntityId: spec.targetEntityId,
    params: spec.params,
    parentQuestId: extra.parentQuestId ?? null,
    rerollOf: extra.rerollOf ?? null,
    // The app's clock, like activity's: progress counts what happened after this.
    offeredAt: new Date(),
  });
  return id;
}

/** What the generators look at (BoardContext), gathered in one place. */
async function boardContext(
  tx: Tx,
  userId: string,
  s: SettingsRow,
  today: DateString,
  acts: readonly Activity[],
): Promise<BoardContext> {
  const weekStart = startOfWeek(today, s.weekStart);
  const activeDays = new Set<DateString>();
  const lastWorked = new Map<string, DateString>();
  const focusByDay = new Map<DateString, number>();
  const historyFrom = addDays(today, -28);
  for (const a of acts) {
    if (qualifies(a)) activeDays.add(a.localDate);
    if (a.type === 'task_completed' || a.type === 'focus_completed') {
      const p = a.payload.projectId;
      if (p && (lastWorked.get(p) ?? '') < a.localDate) lastWorked.set(p, a.localDate);
    }
    if (a.type === 'focus_completed' && a.localDate >= historyFrom && a.localDate < today) {
      focusByDay.set(a.localDate, (focusByDay.get(a.localDate) ?? 0) + a.payload.minutes);
    }
  }

  const activeProjects = await tx
    .select({
      id: projects.id,
      title: projects.title,
      pinned: sql<boolean>`${projects.nextActionTaskId} is not null`,
      openTasks: sql<number>`(select count(*)::int from tasks t where t.project_id = ${outer('projects', 'id')} and t.parent_task_id is null and t.completed_at is null and t.deleted_at is null)`,
      openGoals: sql<number>`(select count(*)::int from goals g where g.project_id = ${outer('projects', 'id')} and g.status = 'open' and g.deleted_at is null)`,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')))
    .orderBy(asc(projects.sortOrder));

  const [counts] = await tx
    .select({
      inbox: sql<number>`count(*) filter (where ${tasks.projectId} is null and ${tasks.parentTaskId} is null)::int`,
      subtasks: sql<number>`count(*) filter (where ${tasks.parentTaskId} is not null and (${tasks.projectId} is null or exists (select 1 from projects p where p.id = ${outer('tasks', 'project_id')} and p.status = 'active')))::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), isNull(tasks.completedAt)));

  const breakdown = await tx
    .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.userId, userId),
        eq(projects.status, 'active'),
        eq(tasks.effort, 'L'),
        isNull(tasks.parentTaskId),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
        sql`not exists (select 1 from tasks s where s.parent_task_id = ${outer('tasks', 'id')} and s.deleted_at is null)`,
      ),
    )
    .limit(20);

  const [top] = await focusList(tx, userId, today);

  const history = await tx
    .select()
    .from(quests)
    .where(and(eq(quests.userId, userId), gte(quests.periodEnd, addDays(today, -60))));
  const lastOffered = new Map<string, DateString>();
  const yesterdayKeys = new Set<string>();
  const currentKeys = new Set<string>();
  let hasDayBoard = false;
  let hasWeekBoard = false;
  let hasReviewQuest = false;
  let hasProjectsQuest = false;
  let pendingFollowUps = 0;
  for (const q of history) {
    const key = questKey(q);
    if ((lastOffered.get(key) ?? '') < q.periodStart) lastOffered.set(key, q.periodStart);
    if (q.periodStart === addDays(today, -1) && q.type === 'daily') yesterdayKeys.add(key);
    if (q.periodEnd >= today && (q.status === 'offered' || q.status === 'completed')) {
      currentKeys.add(key);
    }
    if (q.periodStart === today && q.periodEnd === today && q.type !== 'follow_up') {
      hasDayBoard = true;
    }
    if (q.periodStart === weekStart && (q.type === 'weekly' || q.templateKey === 'time.week')) {
      hasWeekBoard = true;
    }
    if (q.type === 'follow_up' && q.status === 'offered') pendingFollowUps++;
    if (q.templateKey === 'review.weekly' && q.periodStart === weekStart) hasReviewQuest = true;
    if (q.templateKey === 'weekly.projects' && q.periodStart === weekStart) {
      hasProjectsQuest = true;
    }
  }

  return {
    today,
    weekStart: s.weekStart,
    weeklyTarget: s.weeklyActiveDayTarget,
    restingTypes: s.questSettings.restingTypes,
    timeQuestMinutes: {
      min: s.questSettings.timeQuestMinMinutes,
      max: s.questSettings.timeQuestMaxMinutes,
    },
    activeDays,
    projects: activeProjects.map((p) => ({ ...p, lastWorked: lastWorked.get(p.id) ?? null })),
    inboxOpen: counts?.inbox ?? 0,
    openSubtasks: counts?.subtasks ?? 0,
    habitsDue: await habitsDueToday(tx, userId),
    topTask: top ? { id: top.task.id, title: top.task.title } : null,
    breakdownTasks: breakdown.map((t) => ({ ...t, projectId: t.projectId! })),
    focusDays: [...focusByDay.values()].filter((m) => m > 0),
    pendingFollowUps,
    lastOffered,
    yesterdayKeys,
    currentKeys,
    hasDayBoard,
    hasWeekBoard,
    challenge: s.challenge ?? null,
    hasReviewQuest,
    hasProjectsQuest,
  };
}

/**
 * Close what's past (expired, or cancelled when a follow-up's item is gone) and make today's and
 * this week's boards if they don't exist yet.
 */
async function ensureBoard(
  tx: Tx,
  userId: string,
  s: SettingsRow,
  today: DateString,
  acts: readonly Activity[],
  rng: Rng,
) {
  const past = await tx
    .select()
    .from(quests)
    .where(
      and(eq(quests.userId, userId), eq(quests.status, 'offered'), lt(quests.periodEnd, today)),
    );
  for (const q of past) {
    const gone = q.type === 'follow_up' && !(await madeItem(tx, userId, q.targetEntityId));
    await closeQuest(tx, q.id, gone ? 'cancelled' : 'expired');
  }
  const ctx = await boardContext(tx, userId, s, today, acts);
  for (const spec of planBoard(ctx, rng)) await insertQuest(tx, userId, spec);
}

/** The ids of the user's active projects ("Work on every active project", D42). */
async function activeProjectIds(tx: Tx, userId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
  return new Set(rows.map((r) => r.id));
}

const closeQuest = (tx: Tx, id: string, status: QuestRow['status']) =>
  tx
    .update(quests)
    .set({ status, closedAt: new Date() })
    .where(and(eq(quests.id, id), eq(quests.status, 'offered')));

// --- Follow-up items -------------------------------------------------------------------------

/** A task or goal a make quest produced, with which details it has now; null when it's gone. */
async function madeItem(tx: Conn, userId: string, id: string | null): Promise<MadeItem | null> {
  if (!id) return null;
  if (id.startsWith('tsk_')) {
    const [t] = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: sql<boolean>`${tasks.descriptionText} <> ''`,
        effort: sql<boolean>`${tasks.effort} is not null`,
        date: sql<boolean>`(${tasks.dueDate} is not null or ${tasks.scheduledDate} is not null)`,
        goal: sql<boolean>`${tasks.goalId} is not null`,
        subtasks: sql<boolean>`exists (select 1 from tasks s where s.parent_task_id = ${outer('tasks', 'id')} and s.deleted_at is null)`,
        projectGoals: sql<boolean>`exists (select 1 from goals g where g.project_id = ${outer('tasks', 'project_id')} and g.deleted_at is null)`,
      })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    if (!t) return null;
    return {
      kind: 'task',
      id: t.id,
      title: t.title,
      filled: {
        description: t.description,
        effort: t.effort,
        date: t.date,
        goal: t.goal,
        subtasks: t.subtasks,
      },
      unavailable: t.projectGoals ? [] : ['goal'],
    };
  }
  if (id.startsWith('gol_')) {
    const [g] = await tx
      .select({
        id: goals.id,
        title: goals.title,
        description: sql<boolean>`${goals.descriptionText} <> ''`,
        // A commitment goal always has its target; an outcome may have a deadline.
        deadline: sql<boolean>`(${goals.kind} = 'commitment' or ${goals.dueDate} is not null)`,
        task: sql<boolean>`exists (select 1 from tasks t where t.goal_id = ${outer('goals', 'id')} and t.deleted_at is null)`,
      })
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId), isNull(goals.deletedAt)));
    if (!g) return null;
    return {
      kind: 'goal',
      id: g.id,
      title: g.title,
      filled: { description: g.description, deadline: g.deadline, task: g.task },
    };
  }
  return null;
}

// --- Evaluation ------------------------------------------------------------------------------

interface Evaluation {
  done: QuestDone[];
  added: { id: string; title: string }[];
  /** Activities the evaluation itself wrote (quest completions, bonuses). */
  recorded: Activity[];
}

/**
 * Bring quest progress up to date. `only`: evaluate just the quests these activities and touched
 * entities can affect (after a write); without it, every open quest (when a board is viewed).
 */
async function evaluateQuests(
  tx: Tx,
  userId: string,
  today: DateString,
  acts: Activity[],
  only?: { activities: readonly Activity[]; touched: ReadonlySet<string> },
): Promise<Evaluation> {
  const out: Evaluation = { done: [], added: [], recorded: [] };
  const open = await tx
    .select()
    .from(quests)
    .where(
      and(eq(quests.userId, userId), eq(quests.status, 'offered'), gte(quests.periodEnd, today)),
    )
    .orderBy(asc(quests.offeredAt));

  const affected = only ? new Set(only.activities.flatMap((a) => affectedTemplates(a))) : null;
  const relevant = open.filter(
    (q) =>
      !affected ||
      affected.has(q.templateKey) ||
      (q.type === 'follow_up' && q.targetEntityId !== null && only!.touched.has(q.targetEntityId)),
  );

  for (const row of relevant) {
    const q = asQuest(row);
    let progress: number;
    if (q.type === 'follow_up') {
      const item = await madeItem(tx, userId, q.targetEntityId);
      if (!item) {
        // The item was deleted: no follow-up, and (Phase 5) no box for its make quest (D16).
        await closeQuest(tx, q.id, 'cancelled');
        continue;
      }
      progress = filledCount((q.params.missing as DetailPart[]) ?? [], item.filled);
    } else if (q.templateKey === 'weekly.projects') {
      progress = questProgress(q, acts, { activeProjects: await activeProjectIds(tx, userId) });
    } else {
      progress = questProgress(q, acts);
    }
    progress = Math.min(progress, q.target);
    if (progress !== row.progress) {
      await tx.update(quests).set({ progress }).where(eq(quests.id, q.id));
    }
    if (progress < q.target) continue;

    const closed = await tx
      .update(quests)
      .set({ status: 'completed', closedAt: new Date(), progress })
      .where(and(eq(quests.id, q.id), eq(quests.status, 'offered')))
      .returning({ id: quests.id });
    if (!closed.length) continue;
    const recorded = await recordActivity(tx, userId, {
      type: 'quest_completed',
      entityId: q.id,
      payload: {
        questType: q.type,
        xp: q.xp,
        boxTier: q.boxTier,
        ...(q.params.replay ? { replay: true } : {}),
      },
    });
    out.recorded.push(...recorded);
    acts.push(...recorded);
    out.done.push({ id: q.id, type: q.type, title: q.title, xp: q.xp, boxTier: q.boxTier });

    if (q.type === 'tutorial') {
      const added = await advanceTutorial(tx, userId, q.templateKey, today);
      if (added) out.added.push(added);
    }

    if (q.type === 'make') {
      // D16: the new item gets a follow-up asking for its missing details.
      const [madeId] = madeBy(q, acts);
      const item = madeId ? await madeItem(tx, userId, madeId) : null;
      const spec = item ? followUpSpec(item, today, q.id) : null;
      if (spec) {
        const id = await insertQuest(tx, userId, spec, { parentQuestId: q.id });
        out.added.push({ id, title: spec.title });
      }
    }
  }

  if (out.done.some((d) => d.type === 'daily')) {
    out.recorded.push(...(await boardBonus(tx, userId, today, acts)));
  }
  return out;
}

/**
 * The tutorial's next step after `step` (done or skipped), or the end of the tour. A step whose
 * reward was already earned once (an earlier tour) comes back as a replay, worth nothing (D15).
 */
export async function advanceTutorial(
  tx: Tx,
  userId: string,
  step: string | null,
  today: DateString,
): Promise<{ id: string; title: string } | null> {
  const next = step === null ? 'tutorial.area' : nextTutorialStep(step);
  if (!next) {
    await tx.update(userSettings).set({ tutorial: 'done' }).where(eq(userSettings.userId, userId));
    return null;
  }
  const [earned] = await tx
    .select({ id: quests.id })
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.templateKey, next),
        eq(quests.status, 'completed'),
        sql`${quests.rewardXp} > 0`,
      ),
    )
    .limit(1);
  const spec = tutorialSpec(next, today, !!earned);
  const id = await insertQuest(tx, userId, spec);
  return { id, title: spec.title };
}

/** Every daily quest of the day done: the board bonus, once a day. */
async function boardBonus(tx: Tx, userId: string, today: DateString, acts: Activity[]) {
  const daily = await tx
    .select({ status: quests.status })
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.type, 'daily'),
        eq(quests.periodStart, today),
        ne(quests.status, 'rerolled'),
      ),
    );
  if (!daily.length || daily.some((q) => q.status !== 'completed')) return [];
  const key = `bonus_${today}`;
  if (acts.some((a) => a.type === 'quest_bonus' && a.entityId === key)) return [];
  const recorded = await recordActivity(tx, userId, {
    type: 'quest_bonus',
    entityId: key,
    payload: { xp: GAME.quests.boardBonusXp },
  });
  acts.push(...recorded);
  return recorded;
}

// --- Entry points ----------------------------------------------------------------------------

/**
 * After a committed write: evaluate the quests its activity can affect and report what changed.
 * Callers treat a failure as non-fatal (the write already happened).
 */
export async function evaluateAfterWrite(scope: GameScope): Promise<GameEvents | null> {
  const userId = scope.userId;
  if (!userId) return null;
  return db.transaction(async (tx) => {
    const s = await lockUser(tx, userId);
    const today = dayOf(s);
    const acts = await loadActivities(tx, userId);
    const fresh = new Set(scope.activities.map((a) => a.id));
    const before = stateOf(
      acts.filter((a) => !fresh.has(a.id)),
      s,
      today,
    );
    await ensureBoard(tx, userId, s, today, acts, cryptoRng);
    const ev = await evaluateQuests(tx, userId, today, acts, {
      activities: scope.activities,
      touched: scope.touched,
    });
    return gameEvents(before, stateOf(acts, s, today), ev);
  });
}

/** Evaluate every open quest (board views, the retry job, recompute). */
export async function evaluateAll(userId: string) {
  return db.transaction(async (tx) => {
    const s = await lockUser(tx, userId);
    const today = dayOf(s);
    const acts = await loadActivities(tx, userId);
    const before = stateOf(acts, s, today);
    await ensureBoard(tx, userId, s, today, acts, cryptoRng);
    const ev = await evaluateQuests(tx, userId, today, acts);
    const events = gameEvents(before, stateOf(acts, s, today), ev);
    return { today, events: eventful(events) ? events : null, state: events.state };
  });
}

/** The quests to show: today's and this week's, plus open follow-ups. */
export async function questBoard(userId: string) {
  const { today, events } = await evaluateAll(userId);
  const rows = await db
    .select()
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        gte(quests.periodEnd, today),
        sql`${quests.periodStart} <= ${today}`,
        inArray(quests.status, ['offered', 'completed']),
      ),
    )
    .orderBy(asc(quests.offeredAt), asc(quests.id));
  const views = await Promise.all(
    rows.map(async (r) => {
      // Follow-ups also say which of the asked parts are filled in already.
      const item =
        r.type === 'follow_up' && r.status === 'offered'
          ? await madeItem(db, userId, r.targetEntityId)
          : null;
      const filled = item
        ? ((r.params.missing as DetailPart[] | undefined) ?? []).filter((p) => item.filled[p])
        : null;
      return { ...questView(r, today), filled };
    }),
  );
  return { today, quests: views, game: events };
}

function questView(r: QuestRow, today: DateString) {
  return {
    id: r.id,
    type: r.type,
    templateKey: r.templateKey,
    title: r.title,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    period:
      r.periodStart === r.periodEnd
        ? ('day' as const)
        : r.type === 'follow_up'
          ? ('follow_up' as const)
          : ('week' as const),
    target: r.target,
    progress: r.progress,
    xp: r.rewardXp,
    boxTier: r.boxTier,
    targetEntityId: r.targetEntityId,
    params: r.params,
    status: r.status,
    canReroll:
      r.status === 'offered' && rerollable(r) && r.rerollOf === null && r.periodEnd >= today,
    completedAt: r.status === 'completed' ? r.closedAt : null,
  };
}
export type QuestView = ReturnType<typeof questView>;

/** Swap a quest for another of its type, once (D10: one reroll per quest per day). */
export async function rerollQuest(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const s = await lockUser(tx, userId);
    const today = dayOf(s);
    const [row] = await tx
      .select()
      .from(quests)
      .where(and(eq(quests.id, id), eq(quests.userId, userId)));
    if (!row) throw notFound('quest');
    if (row.status !== 'offered' || row.periodEnd < today) {
      throw conflict('quest_closed', 'That quest is already over.');
    }
    if (!rerollable(row) || row.rerollOf !== null) {
      throw conflict('no_reroll', 'This quest can’t be rerolled.');
    }
    const acts = await loadActivities(tx, userId);
    const ctx = await boardContext(tx, userId, s, today, acts);
    const spec = rerollSpec(ctx, asQuest(row), cryptoRng);
    if (!spec) throw conflict('no_reroll', 'There’s nothing else to swap it for right now.');
    // A weekly-period quest keeps its week.
    const replacement = { ...spec, periodStart: row.periodStart, periodEnd: row.periodEnd };
    await closeQuest(tx, row.id, 'rerolled');
    const newId_ = await insertQuest(tx, userId, replacement, { rerollOf: row.id });
    const [fresh] = await tx.select().from(quests).where(eq(quests.id, newId_));
    return questView(fresh!, today);
  });
}

/** Days with something in them, for the heatmap. */
export async function heatmap(userId: string, from: DateString, to: DateString) {
  const all = await loadActivities(db, userId);
  // Credits need the whole log (earn-once, daily caps); the days shown are a window of it.
  const credits = xpCredits(all);
  const acts = all.filter((a) => a.localDate >= from && a.localDate <= to);
  const days = new Map<
    DateString,
    { date: DateString; active: boolean; focusMinutes: number; tasks: number; xp: number }
  >();
  for (const a of acts) {
    const d = days.get(a.localDate) ?? {
      date: a.localDate,
      active: false,
      focusMinutes: 0,
      tasks: 0,
      xp: 0,
    };
    if (qualifies(a)) d.active = true;
    if (a.type === 'focus_completed') d.focusMinutes += a.payload.minutes;
    if (a.type === 'task_completed' && !a.payload.subtask) d.tasks++;
    d.xp += credits.get(a.id) ?? 0;
    days.set(a.localDate, d);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
