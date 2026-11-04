// Quests (D10, D16): a registry of templates, each with a generator (which candidates exist right
// now and how much they're needed) and an evaluator (progress from the activity log). The server
// gathers a `BoardContext` snapshot, `planBoard` decides what to offer, `questProgress` decides
// what's done. New templates are added here; no schema change.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';
import type { Activity } from './activity';
import { GAME } from './config';
import {
  makeFactor,
  pickWeighted,
  questWeight,
  sizeDayMinutes,
  sizeWeekMinutes,
  timeQuestXp,
  type Rng,
} from './select';
import { qualifies } from './streaks';

export const QUEST_TYPES = [
  'quick',
  'daily',
  'time',
  'make',
  'follow_up',
  'weekly',
  'comeback',
] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

/** Types the user can turn off in settings (comeback never rests; follow-ups come with make). */
export const RESTABLE_TYPES = [
  'quick',
  'daily',
  'time',
  'make',
  'weekly',
] as const satisfies readonly QuestType[];

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  quick: 'Quick',
  daily: 'Daily',
  time: 'Time',
  make: 'Make',
  follow_up: 'Follow-up',
  weekly: 'Weekly',
  comeback: 'Comeback',
};

export const BOX_TIERS = ['small', 'standard', 'large', 'special'] as const;
export type BoxTier = (typeof BOX_TIERS)[number];

export const QUEST_STATUSES = ['offered', 'completed', 'expired', 'rerolled', 'cancelled'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** Details a follow-up can ask for. All of them take a minute, none needs outside work. */
export const TASK_PARTS = ['description', 'effort', 'date', 'goal', 'subtasks'] as const;
export const GOAL_PARTS = ['description', 'deadline', 'task'] as const;
export type DetailPart = (typeof TASK_PARTS)[number] | (typeof GOAL_PARTS)[number];

export const PART_LABELS: Record<DetailPart, string> = {
  description: 'a description',
  effort: 'an effort',
  date: 'a due or scheduled date',
  goal: 'a goal',
  subtasks: 'subtasks',
  deadline: 'a deadline',
  task: 'a task under it',
};

/** A quest to offer, before it's stored. */
export interface QuestSpec {
  type: QuestType;
  templateKey: string;
  title: string;
  periodStart: DateString;
  /** The last day it can be done (inclusive). */
  periodEnd: DateString;
  target: number;
  xp: number;
  boxTier: BoxTier;
  targetEntityId: string | null;
  params: Record<string, unknown>;
}

/** A stored quest, as the evaluator reads it. */
export interface QuestLike extends QuestSpec {
  id: string;
  status: QuestStatus;
  offeredAt: Date;
}

/** What the generators may look at: a snapshot the server gathers. */
export interface BoardContext {
  today: DateString;
  weekStart: number;
  weeklyTarget: number;
  restingTypes: readonly string[];
  timeQuestMinutes: { min: number; max: number };
  /** Active days so far (comeback, idle). */
  activeDays: ReadonlySet<DateString>;
  /** Active projects only: parked or completed ones never get quests. */
  projects: readonly {
    id: string;
    title: string;
    openTasks: number;
    openGoals: number;
    /** A next action is pinned. */
    pinned: boolean;
    /** Last day something counted in it (null: never). */
    lastWorked: DateString | null;
  }[];
  inboxOpen: number;
  openSubtasks: number;
  /** The first task of Today's focus list. */
  topTask: { id: string; title: string } | null;
  /** Open L tasks without subtasks, in active projects ("break it down"). */
  breakdownTasks: readonly { id: string; title: string; projectId: string }[];
  /** Focus minutes of each recent day that had focus (sizing). */
  focusDays: readonly number[];
  pendingFollowUps: number;
  /** When each candidate key was last offered. */
  lastOffered: ReadonlyMap<string, DateString>;
  /** Keys offered yesterday (daily quests don't repeat them). */
  yesterdayKeys: ReadonlySet<string>;
  /** Keys of quests already on the current boards. */
  currentKeys: ReadonlySet<string>;
  hasDayBoard: boolean;
  hasWeekBoard: boolean;
}

interface Candidate {
  spec: QuestSpec;
  need: number;
  /** For waiting time: the project it's about, if any. */
  projectId?: string;
}

/** The key that says "the same quest" across days (template + what it's about). */
export const questKey = (q: Pick<QuestSpec, 'templateKey' | 'targetEntityId'>) =>
  `${q.templateKey}:${q.targetEntityId ?? ''}`;

const BOX: Record<QuestType, BoxTier> = {
  quick: 'small',
  follow_up: 'small',
  daily: 'standard',
  make: 'standard',
  comeback: 'standard',
  time: 'standard',
  weekly: 'large',
};

const fmtMinutes = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};

function dayQuest(
  ctx: BoardContext,
  type: QuestType,
  templateKey: string,
  title: string,
  xp: number,
  extra: Partial<QuestSpec> = {},
): QuestSpec {
  return {
    type,
    templateKey,
    title,
    periodStart: ctx.today,
    periodEnd: ctx.today,
    target: 1,
    xp,
    boxTier: BOX[type],
    targetEntityId: null,
    params: {},
    ...extra,
  };
}

// --- Generators ------------------------------------------------------------------------------

function quickCandidates(ctx: BoardContext): Candidate[] {
  const out: Candidate[] = [];
  if (ctx.inboxOpen > 0) {
    out.push({
      spec: dayQuest(ctx, 'quick', 'quick.triage', 'Triage one inbox item', 10),
      need: 2,
    });
  }
  for (const p of ctx.projects) {
    if (p.pinned || p.openTasks === 0) continue;
    out.push({
      spec: dayQuest(ctx, 'quick', 'quick.pin_next', `Pick the next action for “${p.title}”`, 10, {
        targetEntityId: p.id,
        params: { projectId: p.id },
      }),
      need: 1,
      projectId: p.id,
    });
  }
  if (ctx.openSubtasks > 0) {
    out.push({
      spec: dayQuest(ctx, 'quick', 'quick.subtask', 'Tick off one subtask', 10),
      need: 1,
    });
  }
  return out;
}

function dailyCandidates(ctx: BoardContext): Candidate[] {
  const out: Candidate[] = [];
  if (ctx.topTask) {
    out.push({
      spec: dayQuest(ctx, 'daily', 'daily.top_item', `Finish “${ctx.topTask.title}”`, 30, {
        targetEntityId: ctx.topTask.id,
      }),
      need: 1.5,
    });
  }
  for (const p of ctx.projects) {
    if (p.openTasks === 0) continue;
    const idle = p.lastWorked === null ? null : daysBetween(p.lastWorked, ctx.today);
    const stale = idle === null || idle >= GAME.quests.staleProjectDays;
    out.push({
      spec: dayQuest(
        ctx,
        'daily',
        stale ? 'daily.stale_project' : 'daily.project_task',
        stale
          ? `Move “${p.title}” forward: it’s been ${idle === null ? 'a while' : `${idle} days`}`
          : `Complete a task in “${p.title}”`,
        stale ? 40 : 25,
        { targetEntityId: p.id, params: { projectId: p.id } },
      ),
      need: stale ? 2 : 1,
      projectId: p.id,
    });
  }
  out.push({
    spec: dayQuest(ctx, 'daily', 'daily.two_tasks', 'Complete 2 tasks', 20, { target: 2 }),
    need: 1,
  });
  out.push({
    spec: dayQuest(ctx, 'daily', 'daily.focus_session', 'Finish a 25-minute focus session', 20),
    need: 1,
  });
  return out;
}

function timeDaySpec(ctx: BoardContext, rng: Rng): QuestSpec {
  const minutes = sizeDayMinutes(ctx.focusDays, ctx.timeQuestMinutes, rng);
  return dayQuest(
    ctx,
    'time',
    'time.day',
    `Focus ${fmtMinutes(minutes)} today`,
    timeQuestXp(minutes, 'day'),
    {
      target: minutes,
    },
  );
}

function weekBounds(ctx: BoardContext) {
  const start = startOfWeek(ctx.today, ctx.weekStart);
  return { periodStart: start, periodEnd: addDays(start, 6) };
}

function timeWeekSpec(ctx: BoardContext, rng: Rng): QuestSpec {
  const minutes = sizeWeekMinutes(ctx.focusDays, ctx.weeklyTarget, rng);
  return {
    ...dayQuest(
      ctx,
      'time',
      'time.week',
      `Focus ${fmtMinutes(minutes)} this week`,
      timeQuestXp(minutes, 'week'),
      {
        target: minutes,
      },
    ),
    ...weekBounds(ctx),
    boxTier: 'large',
  };
}

function weeklyTargetSpec(ctx: BoardContext): QuestSpec {
  return {
    ...dayQuest(
      ctx,
      'weekly',
      'weekly.target',
      `Be active on ${ctx.weeklyTarget} day${ctx.weeklyTarget === 1 ? '' : 's'} this week`,
      80,
      { target: ctx.weeklyTarget },
    ),
    ...weekBounds(ctx),
  };
}

function makeCandidates(ctx: BoardContext): Candidate[] {
  const { cap, breakdownSubtasks } = GAME.quests.make;
  const out: Candidate[] = [];
  for (const p of ctx.projects) {
    const taskFactor = makeFactor(p.openTasks, cap.task, ctx.pendingFollowUps);
    if (taskFactor > 0) {
      out.push({
        spec: dayQuest(ctx, 'make', 'make.task', `Add a task to “${p.title}”`, 15, {
          targetEntityId: p.id,
          params: { projectId: p.id },
        }),
        need: taskFactor,
        projectId: p.id,
      });
    }
    if (p.openGoals === 0) {
      const goalFactor = makeFactor(p.openGoals, cap.goal, ctx.pendingFollowUps);
      if (goalFactor > 0) {
        out.push({
          spec: dayQuest(ctx, 'make', 'make.goal', `Add a goal to “${p.title}”`, 15, {
            targetEntityId: p.id,
            params: { projectId: p.id },
          }),
          need: goalFactor,
          projectId: p.id,
        });
      }
    }
  }
  for (const t of ctx.breakdownTasks) {
    const factor = makeFactor(0, cap.task, ctx.pendingFollowUps);
    if (factor > 0) {
      out.push({
        spec: dayQuest(ctx, 'make', 'make.subtasks', `Break “${t.title}” into subtasks`, 15, {
          targetEntityId: t.id,
          target: breakdownSubtasks,
          params: { projectId: t.projectId },
        }),
        need: factor,
        projectId: t.projectId,
      });
    }
  }
  return out;
}

/** Days since the candidate was last offered or its project worked on (a week when never). */
function waiting(ctx: BoardContext, c: Candidate): number {
  const seen: DateString[] = [];
  const offered = ctx.lastOffered.get(questKey(c.spec));
  if (offered) seen.push(offered);
  const worked = c.projectId && ctx.projects.find((p) => p.id === c.projectId)?.lastWorked;
  if (worked) seen.push(worked);
  if (!seen.length) return 7;
  return daysBetween(seen.sort().at(-1)!, ctx.today);
}

const weightOf = (ctx: BoardContext) => (c: Candidate) => questWeight(c.need, waiting(ctx, c));

const resting = (ctx: BoardContext, type: QuestType) => ctx.restingTypes.includes(type);

// --- The board -------------------------------------------------------------------------------

/** Whether only the comeback quest should be offered (7+ days with nothing). */
export function isIdle(ctx: Pick<BoardContext, 'activeDays' | 'today'>): boolean {
  const since = sinceActive(ctx);
  return since !== null && since >= GAME.quests.idleAfterDays;
}

function sinceActive(ctx: Pick<BoardContext, 'activeDays' | 'today'>): number | null {
  let last: DateString | null = null;
  for (const d of ctx.activeDays) if (d < ctx.today && (last === null || d > last)) last = d;
  return last === null ? null : daysBetween(last, ctx.today);
}

/** After 2+ inactive days in a row (before today), with some history to come back to. */
export function needsComeback(ctx: Pick<BoardContext, 'activeDays' | 'today'>): boolean {
  const since = sinceActive(ctx);
  return since !== null && since > GAME.quests.comebackAfterDays;
}

/**
 * What to add to the boards now: the day's board when it hasn't been made yet, and the week's.
 * Follow-ups aren't here (they're spawned by make quests).
 */
export function planBoard(ctx: BoardContext, rng: Rng): QuestSpec[] {
  const out: QuestSpec[] = [];
  const idle = isIdle(ctx);

  if (!ctx.hasDayBoard) {
    if (needsComeback(ctx)) {
      out.push(
        dayQuest(
          ctx,
          'comeback',
          'comeback.focus',
          'Welcome back: one 10-minute focus session',
          50,
        ),
      );
    }
    if (!idle) {
      if (!resting(ctx, 'quick')) {
        const quick = quickCandidates(ctx);
        out.push(
          ...pickWeighted(quick, weightOf(ctx), GAME.quests.quickPerDay, rng).map((c) => c.spec),
        );
      }
      if (!resting(ctx, 'daily')) {
        const daily = dailyCandidates(ctx).filter((c) => !ctx.yesterdayKeys.has(questKey(c.spec)));
        out.push(
          ...pickWeighted(daily, weightOf(ctx), GAME.quests.dailyPerDay, rng).map((c) => c.spec),
        );
      }
      if (!resting(ctx, 'time')) out.push(timeDaySpec(ctx, rng));
      if (!resting(ctx, 'make')) {
        // The soft cap is a chance, not just a weight: a full project rarely gets one.
        const [pick] = pickWeighted(makeCandidates(ctx), weightOf(ctx), 1, rng);
        if (pick && rng() < pick.need) out.push(pick.spec);
      }
    }
  }

  if (!ctx.hasWeekBoard && !idle) {
    if (!resting(ctx, 'weekly')) out.push(weeklyTargetSpec(ctx));
    if (!resting(ctx, 'time')) out.push(timeWeekSpec(ctx, rng));
  }
  return out;
}

/** A replacement for a quest being rerolled: same type, something not already on the board. */
export function rerollSpec(ctx: BoardContext, quest: QuestSpec, rng: Rng): QuestSpec | null {
  const fresh = (c: Candidate) => !ctx.currentKeys.has(questKey(c.spec));
  const pick = (cands: Candidate[]) =>
    pickWeighted(cands.filter(fresh), weightOf(ctx), 1, rng)[0]?.spec ?? null;
  switch (quest.type) {
    case 'quick':
      return pick(quickCandidates(ctx));
    case 'daily':
      return pick(dailyCandidates(ctx));
    case 'make':
      return pick(makeCandidates(ctx));
    case 'time': {
      // A new size; keep trying for one that differs.
      for (let i = 0; i < 5; i++) {
        const spec =
          quest.templateKey === 'time.week' ? timeWeekSpec(ctx, rng) : timeDaySpec(ctx, rng);
        if (spec.target !== quest.target) return spec;
      }
      return null;
    }
    default:
      return null;
  }
}

/** Whether a quest can be rerolled at all (once per quest per day; not follow-ups or comeback). */
export const rerollable = (q: Pick<QuestSpec, 'type'>) =>
  q.type === 'quick' || q.type === 'daily' || q.type === 'make' || q.type === 'time';

// --- Follow-ups (D16) ------------------------------------------------------------------------

export interface MadeItem {
  kind: 'task' | 'goal';
  id: string;
  title: string;
  /** Which of its details are filled in right now. */
  filled: Partial<Record<DetailPart, boolean>>;
  /** Parts that don't apply (e.g. a goal for a task whose project has no goals). */
  unavailable?: readonly DetailPart[];
}

/** The follow-up for an item a make quest produced; null when it has nothing missing. */
export function followUpSpec(
  item: MadeItem,
  today: DateString,
  parentKey: string,
): QuestSpec | null {
  const parts = item.kind === 'task' ? TASK_PARTS : GOAL_PARTS;
  const missing = parts.filter((p) => !item.filled[p] && !item.unavailable?.includes(p));
  if (!missing.length) return null;
  const need = Math.min(GAME.quests.make.followUpParts, missing.length);
  return {
    type: 'follow_up',
    templateKey: `follow_up.${item.kind}`,
    title: `Add details to “${item.title}”`,
    periodStart: today,
    periodEnd: addDays(today, 1),
    target: need,
    xp: 15,
    boxTier: 'small',
    targetEntityId: item.id,
    params: { kind: item.kind, missing, from: parentKey },
  };
}

/** How many of a follow-up's missing parts are filled now. */
export function filledCount(missing: readonly DetailPart[], filled: MadeItem['filled']): number {
  return missing.filter((p) => filled[p]).length;
}

// --- Evaluation ------------------------------------------------------------------------------

export interface ProgressExtra {
  /** Follow-ups: how many of the asked parts are filled now. */
  filledParts?: number;
}

/**
 * Progress of a quest: the activity in its period since it was offered. What happened before it
 * appeared never completes it (a board made by the very write that would fulfil it would be free).
 */
export function questProgress(
  q: QuestLike,
  activities: readonly Activity[],
  extra: ProgressExtra = {},
): number {
  const inPeriod = activities.filter(
    (a) =>
      a.localDate >= q.periodStart &&
      a.localDate <= q.periodEnd &&
      a.occurredAt.getTime() >= q.offeredAt.getTime(),
  );
  const projectId = q.params.projectId as string | undefined;
  let n = 0;

  switch (q.templateKey) {
    case 'quick.triage':
      for (const a of inPeriod) {
        if (a.type === 'task_triaged') n++;
        else if (a.type === 'task_completed' && a.payload.projectId === null && !a.payload.subtask)
          n++;
      }
      return n;
    case 'quick.pin_next':
      return inPeriod.filter(
        (a) => a.type === 'next_action_set' && a.payload.projectId === projectId,
      ).length;
    case 'quick.subtask':
      return inPeriod.filter((a) => a.type === 'task_completed' && a.payload.subtask).length;
    case 'daily.top_item':
      return inPeriod.filter((a) => a.type === 'task_completed' && a.entityId === q.targetEntityId)
        .length;
    case 'daily.stale_project':
    case 'daily.project_task':
      return inPeriod.filter(
        (a) =>
          a.type === 'task_completed' && !a.payload.subtask && a.payload.projectId === projectId,
      ).length;
    case 'daily.two_tasks':
      return inPeriod.filter((a) => a.type === 'task_completed' && !a.payload.subtask).length;
    case 'daily.focus_session':
      return inPeriod.filter((a) => a.type === 'focus_completed' && a.payload.minutes >= 25).length;
    case 'time.day':
    case 'time.week':
      for (const a of inPeriod) if (a.type === 'focus_completed') n += a.payload.minutes;
      return n;
    case 'weekly.target':
      return new Set(inPeriod.filter(qualifies).map((a) => a.localDate)).size;
    case 'comeback.focus':
      return inPeriod.filter(
        (a) => a.type === 'focus_completed' && a.payload.minutes >= GAME.xp.focusMinMinutes,
      ).length;
    case 'make.task':
    case 'make.goal':
    case 'make.subtasks':
      return madeBy(q, inPeriod).length;
    case 'follow_up.task':
    case 'follow_up.goal':
      return extra.filledParts ?? 0;
    default:
      return 0;
  }
}

/** The items a make quest's activity produced, oldest first. */
export function madeBy(q: QuestLike, activities: readonly Activity[]): string[] {
  const projectId = q.params.projectId as string | undefined;
  const out: string[] = [];
  for (const a of activities) {
    if (a.type !== 'item_created' || !a.entityId) continue;
    if (a.occurredAt.getTime() < q.offeredAt.getTime()) continue;
    const p = a.payload;
    const ok =
      q.templateKey === 'make.task'
        ? p.kind === 'task' && p.projectId === projectId
        : q.templateKey === 'make.goal'
          ? p.kind === 'goal' && p.projectId === projectId
          : q.templateKey === 'make.subtasks'
            ? p.kind === 'subtask' && p.parentTaskId === q.targetEntityId
            : false;
    if (ok) out.push(a.entityId);
  }
  return out;
}

/** Quest types whose progress a kind of activity can change (incremental evaluation). */
export function affectedTemplates(a: Activity): readonly string[] {
  switch (a.type) {
    case 'task_completed':
      return [
        'quick.triage',
        'quick.subtask',
        'daily.top_item',
        'daily.stale_project',
        'daily.project_task',
        'daily.two_tasks',
        'weekly.target',
      ];
    case 'task_triaged':
      return ['quick.triage'];
    case 'next_action_set':
      return ['quick.pin_next'];
    case 'focus_completed':
      return ['daily.focus_session', 'time.day', 'time.week', 'weekly.target', 'comeback.focus'];
    case 'item_created':
      return ['make.task', 'make.goal', 'make.subtasks'];
    default:
      return [];
  }
}
