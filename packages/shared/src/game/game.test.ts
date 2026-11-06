import { describe, expect, it } from 'vitest';
import { addDays, eachDay } from '../time';
import type { Activity, ActivityPayloads, ActivityType } from './activity';
import { GAME } from './config';
import {
  filledCount,
  followUpSpec,
  isIdle,
  affectedTemplates,
  madeBy,
  needsComeback,
  planBoard,
  questKey,
  questProgress,
  rerollSpec,
  tutorialSpec,
  type BoardContext,
  type QuestLike,
} from './quests';
import { nextTutorialStep, TUTORIAL_STEPS } from './challenge';
import { inReviewWindow, reviewRange, reviewWeek } from './review';
import {
  makeFactor,
  median,
  pickWeighted,
  questWeight,
  seededRng,
  sizeDayMinutes,
  sizeWeekMinutes,
  timeQuestXp,
} from './select';
import { eventful, gameEvents, gameState } from './state';
import { activeDaysOf, dailyStreak, daysSinceActive, weeklyStreak } from './streaks';
import { levelFor, levelProgress, totalXp, xpCredits, xpForLevel } from './xp';

let seq = 0;
function act<T extends ActivityType>(
  type: T,
  localDate: string,
  payload: ActivityPayloads[T],
  entityId: string | null = `e${++seq}`,
  occurredAt = new Date(`${localDate}T12:00:00Z`),
): Activity {
  return {
    id: `act_${String(++seq).padStart(6, '0')}`,
    type,
    entityId,
    localDate,
    occurredAt,
    payload,
  } as Activity;
}
const done = (day: string, effort: 'S' | 'M' | 'L' | null = 'S', entityId?: string, extra = {}) =>
  act('task_completed', day, { effort, projectId: 'prj_a', subtask: false, ...extra }, entityId);
const focus = (day: string, minutes: number, entityId?: string) =>
  act('focus_completed', day, { minutes, projectId: null, taskId: null }, entityId);

describe('xp', () => {
  it('pays tasks by effort, unset effort as S, subtasks nothing', () => {
    const acts = [
      done('2026-11-02', 'S'),
      done('2026-11-02', 'M'),
      done('2026-11-02', 'L'),
      done('2026-11-02', null),
      act('task_completed', '2026-11-02', { effort: 'L', projectId: null, subtask: true }),
    ];
    expect([...xpCredits(acts).values()]).toEqual([10, 25, 50, 10, 0]);
  });

  it('earns once per task: re-completing after a reopen earns 0', () => {
    const acts = [
      done('2026-11-01', 'M', 'tsk_1'),
      act('task_reopened', '2026-11-01', { projectId: 'prj_a' }, 'tsk_1'),
      done('2026-11-02', 'L', 'tsk_1'),
    ];
    const credits = xpCredits(acts);
    expect(totalXp(credits)).toBe(25);
  });

  it('pays focus from 10 minutes on, one XP a minute', () => {
    expect([
      ...xpCredits([
        focus('2026-11-02', 9),
        focus('2026-11-02', 10),
        focus('2026-11-02', 47),
      ]).values(),
    ]).toEqual([0, 10, 47]);
  });

  it('halves task XP past the daily soft cap, per day, in order', () => {
    const day = '2026-11-02';
    const acts = [
      ...Array.from({ length: 3 }, () => done(day, 'L')), // 150
      done(day, 'L'), // 50 more → 200, still full
      done(day, 'L'), // all above the cap: 25
      done(day, 'M'), // 12 (floor of 12.5)
      done('2026-11-03', 'L'), // a new day starts fresh
    ];
    expect([...xpCredits(acts).values()]).toEqual([50, 50, 50, 50, 25, 12, 50]);
  });

  it('splits a task that crosses the cap', () => {
    const day = '2026-11-02';
    const acts = [...Array.from({ length: 18 }, () => done(day, 'S')), done(day, 'L')]; // 180, then 50
    expect(xpCredits(acts).get(acts.at(-1)!.id)).toBe(20 + 15);
  });

  it('doesn’t cap focus or quests', () => {
    const day = '2026-11-02';
    const acts = [
      ...Array.from({ length: 5 }, () => done(day, 'L')),
      focus(day, 120),
      act('quest_completed', day, { questType: 'daily', xp: 40, boxTier: 'standard' }),
    ];
    expect(totalXp(xpCredits(acts))).toBe(200 + 25 + 120 + 40);
  });

  it('is the same however the log is ordered (it sorts by time)', () => {
    const a = done('2026-11-02', 'M', 'tsk_x');
    const b = done('2026-11-03', 'M', 'tsk_x');
    expect(xpCredits([b, a]).get(a.id)).toBe(25);
    expect(xpCredits([b, a]).get(b.id)).toBe(0);
  });

  it('counts quests and bonuses once each', () => {
    const q = act(
      'quest_completed',
      '2026-11-02',
      { questType: 'daily', xp: 30, boxTier: 'standard' },
      'qst_1',
    );
    const again = act(
      'quest_completed',
      '2026-11-02',
      { questType: 'daily', xp: 30, boxTier: 'standard' },
      'qst_1',
    );
    expect(totalXp(xpCredits([q, again]))).toBe(30);
  });
});

describe('levels', () => {
  it('follows 50·n·(n−1)', () => {
    expect([1, 2, 3, 4, 5, 10].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000, 4500]);
  });

  it('switches exactly at the thresholds', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(99)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(299)).toBe(2);
    expect(levelFor(300)).toBe(3);
    expect(levelFor(4500)).toBe(10);
    expect(levelFor(4499)).toBe(9);
    for (let n = 1; n < 200; n++) {
      expect(levelFor(xpForLevel(n))).toBe(n);
      expect(levelFor(xpForLevel(n) - 1)).toBe(Math.max(1, n - 1));
    }
  });

  it('reports progress inside a level', () => {
    expect(levelProgress(350)).toEqual({ level: 3, into: 50, span: 300 });
  });
});

describe('active days', () => {
  it('count completed tasks (subtasks too) and focus from 10 minutes', () => {
    const days = activeDaysOf([
      done('2026-11-01'),
      act('task_completed', '2026-11-02', { effort: null, projectId: null, subtask: true }),
      focus('2026-11-03', 9),
      focus('2026-11-04', 10),
      act('item_created', '2026-11-05', { kind: 'task', projectId: null, parentTaskId: null }),
    ]);
    expect([...days].sort()).toEqual(['2026-11-01', '2026-11-02', '2026-11-04']);
  });
});

describe('daily streak', () => {
  const run = (from: string, n: number) => eachDay(from, addDays(from, n - 1));

  it('counts consecutive days and keeps today open', () => {
    const active = new Set(run('2026-11-01', 3));
    expect(dailyStreak(active, '2026-11-03')).toMatchObject({ current: 3, activeToday: true });
    // Today (11-04) isn't over: the streak stands, at risk.
    expect(dailyStreak(active, '2026-11-04')).toMatchObject({
      current: 3,
      activeToday: false,
      atRisk: true,
    });
    // A whole day missed without freezes ends it.
    expect(dailyStreak(active, '2026-11-05')).toMatchObject({
      current: 0,
      longest: 3,
      atRisk: false,
    });
  });

  it('earns a freeze per 7 days in a row, banks at most 2', () => {
    expect(dailyStreak(new Set(run('2026-11-01', 6)), '2026-11-06').freezes).toBe(0);
    expect(dailyStreak(new Set(run('2026-11-01', 7)), '2026-11-07').freezes).toBe(1);
    expect(dailyStreak(new Set(run('2026-11-01', 14)), '2026-11-14').freezes).toBe(2);
    expect(dailyStreak(new Set(run('2026-11-01', 30)), '2026-11-30').freezes).toBe(2);
  });

  it('uses a banked freeze for a missed day and keeps the streak', () => {
    const active = new Set([...run('2026-11-01', 7), '2026-11-09']); // 11-08 missed
    const s = dailyStreak(active, '2026-11-09');
    expect(s).toMatchObject({ current: 8, freezes: 0, frozenDays: ['2026-11-08'] });
  });

  it('ends the run when the missed days outnumber the freezes', () => {
    const active = new Set([...run('2026-11-01', 7), '2026-11-10']); // 11-08 and 11-09 missed
    expect(dailyStreak(active, '2026-11-10')).toMatchObject({ current: 1, longest: 7, freezes: 0 });
  });

  it('a freeze breaks the run for earning new ones', () => {
    // 7 days (1 freeze), miss one (used), 6 more: no new freeze yet.
    const active = new Set([...run('2026-11-01', 7), ...run('2026-11-09', 6)]);
    expect(dailyStreak(active, '2026-11-14')).toMatchObject({ current: 13, freezes: 0 });
    active.add('2026-11-15');
    expect(dailyStreak(active, '2026-11-15')).toMatchObject({ current: 14, freezes: 1 });
  });

  it('isn’t at risk while a freeze would cover today', () => {
    const active = new Set(run('2026-11-01', 7));
    expect(dailyStreak(active, '2026-11-08')).toMatchObject({
      current: 7,
      freezes: 1,
      atRisk: false,
    });
  });

  it('is empty with no history', () => {
    expect(dailyStreak(new Set(), '2026-11-01')).toMatchObject({
      current: 0,
      longest: 0,
      freezes: 0,
    });
  });

  it('ignores future days', () => {
    expect(dailyStreak(new Set(['2026-12-01']), '2026-11-01').current).toBe(0);
  });

  it('reads days as they were written (a time-zone change never rewrites history)', () => {
    // A move east can make the next local day come early; the logged days are what count.
    const active = new Set(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(dailyStreak(active, '2026-11-03').current).toBe(3);
  });
});

describe('weekly streak', () => {
  it('counts weeks meeting the target; the current week only adds', () => {
    // Weeks start Monday: 2026-10-19, 10-26, 11-02.
    const active = new Set([
      ...['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
      ...['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-30'],
      '2026-11-02',
    ]);
    const s = weeklyStreak(active, '2026-11-03', 1, 4);
    expect(s.current).toBe(2);
    expect(s.week).toEqual({ start: '2026-11-02', activeDays: 1, target: 4, met: false });
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05']) active.add(d);
    expect(weeklyStreak(active, '2026-11-05', 1, 4)).toMatchObject({
      current: 3,
      week: { met: true },
    });
  });

  it('breaks on a week below target', () => {
    const active = new Set(['2026-10-19', '2026-10-20', '2026-10-26']);
    expect(weeklyStreak(active, '2026-11-03', 1, 2)).toMatchObject({ current: 0, longest: 1 });
  });

  it('respects the week start', () => {
    // Sunday 2026-11-01 belongs to the week of 10-26 when weeks start Monday, to its own on Sundays.
    const active = new Set(['2026-11-01']);
    expect(weeklyStreak(active, '2026-11-01', 1, 1).week.start).toBe('2026-10-26');
    expect(weeklyStreak(active, '2026-11-01', 0, 1).week.start).toBe('2026-11-01');
  });

  it('daysSinceActive looks before today only', () => {
    expect(daysSinceActive(new Set(['2026-11-01', '2026-11-04']), '2026-11-04')).toBe(3);
    expect(daysSinceActive(new Set(), '2026-11-04')).toBeNull();
  });
});

describe('state and events', () => {
  const settings = { today: '2026-11-03', weekStart: 1, weeklyActiveDayTarget: 4 };

  it('derives everything from the log', () => {
    const acts = [done('2026-11-02', 'L'), done('2026-11-03', 'L'), focus('2026-11-03', 30)];
    const s = gameState(acts, settings);
    expect(s).toMatchObject({
      xp: 130,
      xpToday: 80,
      level: { level: 2, into: 30 },
      daily: { current: 2 },
    });
  });

  it('reports what a write changed', () => {
    const before = gameState(
      [done('2026-11-02', 'L'), done('2026-11-02', 'S', undefined)],
      settings,
    ); // 60, streak 1
    const after = gameState(
      [done('2026-11-02', 'L'), done('2026-11-02', 'S'), done('2026-11-03', 'L')],
      settings,
    );
    const e = gameEvents(before, after, { done: [], added: [] });
    expect(e).toMatchObject({ xp: 50, levelUp: { from: 1, to: 2 }, streak: { from: 1, to: 2 } });
    expect(eventful(e)).toBe(true);
    expect(eventful(gameEvents(after, after, { done: [], added: [] }))).toBe(false);
  });
});

describe('selection and sizing', () => {
  it('weights grow with waiting time, capped', () => {
    expect(questWeight(1, 0)).toBe(1);
    expect(questWeight(1, 7)).toBe(4);
    expect(questWeight(2, 14)).toBe(18);
    expect(questWeight(1, 1000)).toBe(questWeight(1, GAME.quests.maxWaitingDays));
    expect(questWeight(1, -3)).toBe(1);
  });

  it('picks distinct items in proportion to weight', () => {
    const rng = seededRng(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) {
      const [x] = pickWeighted(['a', 'b'] as const, (k) => (k === 'a' ? 3 : 1), 1, rng);
      counts[x!]++;
    }
    expect(counts.a / 4000).toBeGreaterThan(0.7);
    expect(counts.a / 4000).toBeLessThan(0.8);
    const all = pickWeighted([1, 2, 3, 4], () => 1, 10, rng);
    expect(new Set(all).size).toBe(4);
    expect(pickWeighted([1, 2], () => 0, 1, rng)).toEqual([]);
  });

  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('sizes time quests from your own days', () => {
    const limits = { min: 15, max: 180 };
    for (let seed = 0; seed < 50; seed++) {
      const m = sizeDayMinutes([60, 60, 60, 60], limits, seededRng(seed));
      expect(m % 5).toBe(0);
      expect(m).toBeGreaterThanOrEqual(45); // 60 × 0.8 = 48 → 45 or 50
      expect(m).toBeLessThanOrEqual(70);
    }
    // Too little history: the default range.
    const d = sizeDayMinutes([600], limits, seededRng(3));
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(60);
    // Clamped to the settings.
    expect(sizeDayMinutes([500, 500, 500], limits, seededRng(1))).toBe(180);
    expect(sizeDayMinutes([5, 5, 5], limits, seededRng(1))).toBe(15);
    const w = sizeWeekMinutes([60, 60, 60], 4, seededRng(2));
    expect(w % 15).toBe(0);
    expect(w).toBeGreaterThanOrEqual(180);
    expect(w).toBeLessThanOrEqual(300);
  });

  it('time quest XP grows with the target, within bounds', () => {
    expect(timeQuestXp(15, 'day')).toBe(30);
    expect(timeQuestXp(60, 'day')).toBe(40);
    expect(timeQuestXp(600, 'day')).toBe(80);
    expect(timeQuestXp(240, 'week')).toBe(60);
    expect(timeQuestXp(1800, 'week')).toBe(100);
  });

  it('make-quest soft cap shrinks with open and undetailed items, with a ceiling', () => {
    expect(makeFactor(0, 15, 0)).toBe(1);
    expect(makeFactor(15, 15, 0)).toBe(0.5);
    expect(makeFactor(0, 15, 1)).toBeCloseTo(1 / 3);
    expect(makeFactor(30, 15, 0)).toBe(0);
    expect(makeFactor(0, 15, 3)).toBe(0);
  });
});

// --- Quests ------------------------------------------------------------------------------------

const TODAY = '2026-11-04';

function ctx(over: Partial<BoardContext> = {}): BoardContext {
  return {
    today: TODAY,
    weekStart: 1,
    weeklyTarget: 4,
    restingTypes: [],
    timeQuestMinutes: { min: 15, max: 180 },
    activeDays: new Set(['2026-11-03']),
    projects: [
      {
        id: 'prj_a',
        title: 'Thesis',
        openTasks: 5,
        openGoals: 1,
        pinned: false,
        lastWorked: '2026-11-03',
      },
      {
        id: 'prj_b',
        title: 'Game',
        openTasks: 2,
        openGoals: 0,
        pinned: true,
        lastWorked: '2026-10-20',
      },
    ],
    inboxOpen: 2,
    openSubtasks: 1,
    habitsDue: [],
    topTask: { id: 'tsk_top', title: 'Read chapter 3' },
    breakdownTasks: [],
    focusDays: [],
    pendingFollowUps: 0,
    lastOffered: new Map(),
    yesterdayKeys: new Set(),
    currentKeys: new Set(),
    hasDayBoard: false,
    hasWeekBoard: false,
    challenge: null,
    hasReviewQuest: true,
    hasProjectsQuest: true,
    ...over,
  };
}

function stored(
  spec: ReturnType<typeof planBoard>[number],
  offeredAt = new Date(`${TODAY}T09:00:00Z`),
): QuestLike {
  return { ...spec, id: `qst_${++seq}`, status: 'offered', offeredAt };
}

describe('board', () => {
  it('offers quick, daily, time and the week’s quests', () => {
    const board = planBoard(ctx(), seededRng(7));
    const count = (t: string) => board.filter((q) => q.type === t).length;
    expect(count('quick')).toBe(3);
    expect(count('daily')).toBe(3);
    expect(board.filter((q) => q.templateKey === 'time.day')).toHaveLength(1);
    expect(board.filter((q) => q.templateKey === 'time.week')).toHaveLength(1);
    expect(count('weekly')).toBe(1);
    expect(count('comeback')).toBe(0);
    expect(count('make')).toBeLessThanOrEqual(1);
    // Day quests are for today; week quests for the week (Mon–Sun).
    const week = board.find((q) => q.type === 'weekly')!;
    expect([week.periodStart, week.periodEnd, week.boxTier]).toEqual([
      '2026-11-02',
      '2026-11-08',
      'large',
    ]);
  });

  it('makes nothing twice: existing boards are left alone', () => {
    expect(planBoard(ctx({ hasDayBoard: true, hasWeekBoard: true }), seededRng(1))).toEqual([]);
    const weekOnly = planBoard(ctx({ hasDayBoard: true }), seededRng(1));
    expect(weekOnly.every((q) => q.periodStart === '2026-11-02')).toBe(true);
  });

  it('skips resting types', () => {
    const board = planBoard(
      ctx({ restingTypes: ['quick', 'time', 'make', 'weekly'] }),
      seededRng(3),
    );
    expect(new Set(board.map((q) => q.type))).toEqual(new Set(['daily']));
  });

  it('never targets parked projects (only active ones are in the context)', () => {
    const board = planBoard(ctx({ projects: [] }), seededRng(3));
    expect(board.some((q) => q.params.projectId)).toBe(false);
    expect(board.some((q) => q.type === 'make')).toBe(false);
  });

  it('doesn’t repeat yesterday’s daily quests', () => {
    const yesterday = new Set([
      'daily.two_tasks:',
      'daily.focus_session:',
      'daily.top_item:tsk_top',
    ]);
    for (let seed = 0; seed < 20; seed++) {
      const board = planBoard(ctx({ yesterdayKeys: yesterday }), seededRng(seed));
      for (const q of board.filter((x) => x.type === 'daily'))
        expect(yesterday.has(questKey(q))).toBe(false);
    }
  });

  it('brings the comeback quest after 2 inactive days, and only it after 7', () => {
    const away3 = ctx({ activeDays: new Set(['2026-11-01']) });
    expect(needsComeback(away3)).toBe(true);
    expect(isIdle(away3)).toBe(false);
    const board = planBoard(away3, seededRng(1));
    expect(board.some((q) => q.type === 'comeback')).toBe(true);
    expect(board.some((q) => q.type === 'daily')).toBe(true);

    expect(needsComeback(ctx({ activeDays: new Set(['2026-11-02']) }))).toBe(false); // 1 day off
    expect(needsComeback(ctx({ activeDays: new Set() }))).toBe(false); // nothing to come back to

    const idle = planBoard(ctx({ activeDays: new Set(['2026-10-20']) }), seededRng(1));
    expect(idle.map((q) => q.type)).toEqual(['comeback']);
  });

  it('make quests: soft cap and hard ceiling', () => {
    // With 3 pending follow-ups, never.
    for (let seed = 0; seed < 30; seed++) {
      expect(
        planBoard(ctx({ pendingFollowUps: 3 }), seededRng(seed)).some((q) => q.type === 'make'),
      ).toBe(false);
    }
    // Empty projects get them often; full ones rarely.
    const rate = (openTasks: number) => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const c = ctx({
          projects: [
            {
              id: 'prj_a',
              title: 'A',
              openTasks,
              openGoals: 2,
              pinned: true,
              lastWorked: '2026-11-03',
            },
          ],
        });
        if (planBoard(c, seededRng(seed)).some((q) => q.type === 'make')) n++;
      }
      return n / 400;
    };
    expect(rate(0)).toBeGreaterThan(0.9);
    expect(rate(20)).toBeLessThan(0.5);
    expect(rate(30)).toBe(0);
  });

  it('rerolls into something not on the board', () => {
    const c = ctx();
    const board = planBoard(c, seededRng(5));
    const current = new Set(board.map(questKey));
    const daily = board.find((q) => q.type === 'daily')!;
    const next = rerollSpec({ ...c, currentKeys: current }, daily, seededRng(9));
    expect(next?.type).toBe('daily');
    expect(current.has(questKey(next!))).toBe(false);
    const time = board.find((q) => q.templateKey === 'time.day')!;
    expect(rerollSpec({ ...c, currentKeys: current }, time, seededRng(2))?.target).not.toBe(
      time.target,
    );
  });
});

describe('progress', () => {
  it('counts activity inside the period, since the quest was offered', () => {
    const q = stored(
      planBoard(ctx({ restingTypes: ['quick', 'daily', 'make', 'weekly'] }), seededRng(1)).find(
        (x) => x.templateKey === 'time.day',
      )!,
    );
    const early = act(
      'focus_completed',
      TODAY,
      { minutes: 40, projectId: null, taskId: null },
      'f0',
      new Date(`${TODAY}T08:00:00Z`),
    );
    const acts = [focus('2026-11-03', 50), early, focus(TODAY, 20), focus(TODAY, 15)];
    expect(questProgress(q, acts)).toBe(35);
  });

  it('task quests', () => {
    const c = ctx();
    const two = stored({
      ...planBoard(c, seededRng(1))[0]!,
      templateKey: 'daily.two_tasks',
      target: 2,
    });
    expect(
      questProgress(two, [
        done(TODAY),
        act('task_completed', TODAY, { effort: null, projectId: 'prj_a', subtask: true }),
      ]),
    ).toBe(1);
    const top = stored({
      ...two,
      templateKey: 'daily.top_item',
      targetEntityId: 'tsk_top',
      target: 1,
    });
    expect(questProgress(top, [done(TODAY, 'S', 'tsk_other')])).toBe(0);
    expect(questProgress(top, [done(TODAY, 'S', 'tsk_top')])).toBe(1);
    const triage = stored({ ...two, templateKey: 'quick.triage', target: 1 });
    expect(questProgress(triage, [act('task_triaged', TODAY, { projectId: 'prj_a' })])).toBe(1);
    expect(questProgress(triage, [done(TODAY, 'S', undefined, { projectId: null })])).toBe(1);
  });

  it('weekly target counts active days of the week', () => {
    const q = stored(
      { ...planBoard(ctx(), seededRng(1)).find((x) => x.type === 'weekly')! },
      new Date('2026-11-02T00:00:00Z'),
    );
    const acts = [
      done('2026-11-01'),
      done('2026-11-02'),
      done('2026-11-02'),
      focus('2026-11-03', 12),
      focus(TODAY, 5),
    ];
    expect(questProgress(q, acts)).toBe(2);
  });

  it('make quests count only what’s made after they were offered', () => {
    const offeredAt = new Date(`${TODAY}T10:00:00Z`);
    const q = stored(
      {
        ...planBoard(ctx(), seededRng(1))[0]!,
        type: 'make',
        templateKey: 'make.task',
        params: { projectId: 'prj_a' },
        targetEntityId: 'prj_a',
        target: 1,
      },
      offeredAt,
    );
    const early = act(
      'item_created',
      TODAY,
      { kind: 'task', projectId: 'prj_a', parentTaskId: null },
      'tsk_early',
      new Date(`${TODAY}T09:00:00Z`),
    );
    const other = act(
      'item_created',
      TODAY,
      { kind: 'task', projectId: 'prj_b', parentTaskId: null },
      'tsk_b',
      new Date(`${TODAY}T11:00:00Z`),
    );
    const made = act(
      'item_created',
      TODAY,
      { kind: 'task', projectId: 'prj_a', parentTaskId: null },
      'tsk_new',
      new Date(`${TODAY}T11:00:00Z`),
    );
    expect(questProgress(q, [early, other])).toBe(0);
    expect(questProgress(q, [early, other, made])).toBe(1);
    expect(madeBy(q, [early, other, made])).toEqual(['tsk_new']);
  });

  it('“Add a task to X” also counts a task moved from the inbox into X, once', () => {
    const offeredAt = new Date(`${TODAY}T10:00:00Z`);
    const q = stored(
      {
        ...planBoard(ctx(), seededRng(1))[0]!,
        type: 'make',
        templateKey: 'make.task',
        params: { projectId: 'prj_a' },
        targetEntityId: 'prj_a',
        target: 1,
      },
      offeredAt,
    );
    const at = new Date(`${TODAY}T11:00:00Z`);
    const inbox = act(
      'item_created',
      TODAY,
      { kind: 'task', projectId: null, parentTaskId: null },
      'tsk_i',
      at,
    );
    const elsewhere = act('task_triaged', TODAY, { projectId: 'prj_b' }, 'tsk_j', at);
    const triaged = act('task_triaged', TODAY, { projectId: 'prj_a' }, 'tsk_i', at);
    expect(questProgress(q, [inbox, elsewhere])).toBe(0);
    expect(madeBy(q, [inbox, elsewhere, triaged, triaged])).toEqual(['tsk_i']);
    expect(affectedTemplates(triaged)).toContain('make.task');
  });
});

describe('follow-ups', () => {
  it('ask for 2 of the missing parts and last until the end of the next day', () => {
    const spec = followUpSpec(
      {
        kind: 'task',
        id: 'tsk_1',
        title: 'Outline',
        filled: { effort: true },
        unavailable: ['goal'],
      },
      TODAY,
      'qst_make',
    )!;
    expect(spec).toMatchObject({
      type: 'follow_up',
      target: 2,
      periodStart: TODAY,
      periodEnd: '2026-11-05',
      boxTier: 'small',
      targetEntityId: 'tsk_1',
      params: { missing: ['description', 'date', 'subtasks'] },
    });
    expect(
      filledCount(['description', 'date', 'subtasks'], { description: true, effort: true }),
    ).toBe(1);
  });

  it('ask for less when less is missing, and nothing when it’s complete', () => {
    expect(
      followUpSpec(
        { kind: 'goal', id: 'gol_1', title: 'G', filled: { description: true, deadline: true } },
        TODAY,
        'q',
      )!.target,
    ).toBe(1);
    expect(
      followUpSpec(
        {
          kind: 'goal',
          id: 'gol_1',
          title: 'G',
          filled: { description: true, deadline: true, task: true },
        },
        TODAY,
        'q',
      ),
    ).toBeNull();
  });
});

describe('habit check-ins', () => {
  it('earn 10 XP once per habit and day, and make the day active', () => {
    const a = act('habit_checked', TODAY, { date: TODAY, projectId: null }, 'hab_a');
    const again = act('habit_checked', TODAY, { date: TODAY, projectId: null }, 'hab_a');
    const other = act('habit_checked', TODAY, { date: TODAY, projectId: null }, 'hab_b');
    const yesterday = act(
      'habit_checked',
      TODAY,
      { date: addDays(TODAY, -1), projectId: null },
      'hab_a',
    );
    const credits = xpCredits([a, again, other, yesterday]);
    expect([a, again, other, yesterday].map((x) => credits.get(x.id))).toEqual([10, 0, 10, 10]);
    expect(activeDaysOf([a]).has(TODAY)).toBe(true);
  });

  it('feed the habit quests', () => {
    const due = [
      { id: 'hab_a', title: 'Read' },
      { id: 'hab_b', title: 'Run' },
    ];
    const board = planBoard(ctx({ habitsDue: due }), seededRng(1));
    const daily = dailyCandidatesOf(ctx({ habitsDue: due }));
    expect(daily).toContain('daily.all_habits');
    const all = stored(
      {
        ...board[0]!,
        type: 'daily',
        templateKey: 'daily.all_habits',
        target: 2,
        params: { habitIds: ['hab_a', 'hab_b'] },
      },
      new Date(`${TODAY}T08:00:00Z`),
    );
    const checkA = act('habit_checked', TODAY, { date: TODAY, projectId: null }, 'hab_a');
    const backdated = act(
      'habit_checked',
      TODAY,
      { date: addDays(TODAY, -1), projectId: null },
      'hab_b',
    );
    const checkB = act('habit_checked', TODAY, { date: TODAY, projectId: null }, 'hab_b');
    expect(questProgress(all, [checkA, backdated])).toBe(1);
    expect(questProgress(all, [checkA, backdated, checkB, checkB])).toBe(2);
    expect(affectedTemplates(checkA)).toEqual(
      expect.arrayContaining(['quick.habit', 'daily.all_habits', 'weekly.target']),
    );
  });

  it('offer no habit quests without habits due', () => {
    expect(dailyCandidatesOf(ctx())).not.toContain('daily.all_habits');
    expect(dailyCandidatesOf(ctx({ habitsDue: [{ id: 'hab_a', title: 'Read' }] }))).not.toContain(
      'daily.all_habits',
    );
  });
});

/** Template keys a board could offer as daily quests (over many seeds). */
function dailyCandidatesOf(c: BoardContext): string[] {
  const keys = new Set<string>();
  for (let seed = 1; seed < 200; seed++) {
    for (const q of planBoard(c, seededRng(seed))) keys.add(q.templateKey);
  }
  return [...keys];
}

describe('tutorial (D31)', () => {
  const made = (
    day: string,
    kind: 'area' | 'project' | 'task' | 'subtask' | 'goal',
    projectId: string | null = null,
  ) => act('item_created', day, { kind, projectId, parentTaskId: null });
  const step = (key: (typeof TUTORIAL_STEPS)[number], replay = false) =>
    stored(tutorialSpec(key, TODAY, replay));

  it('chains five steps; the last pays more and gives a large box', () => {
    expect(TUTORIAL_STEPS.map((s) => nextTutorialStep(s))).toEqual([
      'tutorial.project',
      'tutorial.task',
      'tutorial.complete',
      'tutorial.focus',
      null,
    ]);
    const first = tutorialSpec('tutorial.area', TODAY, false);
    const last = tutorialSpec('tutorial.focus', TODAY, false);
    expect([first.type, first.xp, first.boxTier, first.target]).toEqual([
      'tutorial',
      20,
      'small',
      1,
    ]);
    expect([last.xp, last.boxTier]).toEqual([50, 'large']);
    // At the user's pace: open for a long time, not just today.
    expect(first.periodEnd > addDays(TODAY, 300)).toBe(true);
  });

  it('a replay earns nothing', () => {
    const again = tutorialSpec('tutorial.focus', TODAY, true);
    expect([again.xp, again.params.replay]).toEqual([0, true]);
  });

  it('counts each step from what happens in the app after it appeared', () => {
    const later = new Date(`${TODAY}T10:00:00Z`);
    const at = <A extends Activity>(a: A) => ({ ...a, occurredAt: later });
    expect(questProgress(step('tutorial.area'), [at(made(TODAY, 'area'))])).toBe(1);
    expect(questProgress(step('tutorial.area'), [at(made(TODAY, 'project', 'prj_x'))])).toBe(0);
    expect(questProgress(step('tutorial.project'), [at(made(TODAY, 'project', 'prj_x'))])).toBe(1);
    // A task in a project counts, and so does moving one there from the inbox; an inbox task doesn't.
    expect(questProgress(step('tutorial.task'), [at(made(TODAY, 'task', null))])).toBe(0);
    expect(questProgress(step('tutorial.task'), [at(made(TODAY, 'task', 'prj_x'))])).toBe(1);
    expect(
      questProgress(step('tutorial.task'), [
        at(act('task_triaged', TODAY, { projectId: 'prj_x' })),
      ]),
    ).toBe(1);
    expect(questProgress(step('tutorial.complete'), [at(done(TODAY))])).toBe(1);
    expect(questProgress(step('tutorial.focus'), [at(focus(TODAY, 9))])).toBe(0);
    expect(questProgress(step('tutorial.focus'), [at(focus(TODAY, 10))])).toBe(1);
    // What happened before the step appeared doesn't count.
    const before = { ...made(TODAY, 'area'), occurredAt: new Date(`${TODAY}T08:00:00Z`) };
    expect(questProgress(step('tutorial.area'), [before])).toBe(0);
  });

  it('is evaluated after the writes that can complete it', () => {
    expect(affectedTemplates(made(TODAY, 'area'))).toContain('tutorial.area');
    expect(affectedTemplates(made(TODAY, 'project'))).toContain('tutorial.project');
    expect(affectedTemplates(done(TODAY))).toContain('tutorial.complete');
    expect(affectedTemplates(focus(TODAY, 10))).toContain('tutorial.focus');
    expect(affectedTemplates(act('task_triaged', TODAY, { projectId: 'p' }))).toContain(
      'tutorial.task',
    );
  });

  it('creating areas and projects earns nothing and doesn’t make an active day', () => {
    const a = made(TODAY, 'area');
    expect(xpCredits([a]).get(a.id)).toBe(0);
    expect(activeDaysOf([a, made(TODAY, 'project', 'p')]).size).toBe(0);
  });
});

describe('challenge tuning (D36)', () => {
  // Four quick candidates: triage, pick the next action, a subtask, a habit.
  const habitsDue = [{ id: 'hab_1', title: 'Read' }];

  it('forgetting: one more quick quest a day', () => {
    expect(
      planBoard(ctx({ habitsDue }), seededRng(7)).filter((q) => q.type === 'quick'),
    ).toHaveLength(3);
    const board = planBoard(ctx({ challenge: 'forgetting', habitsDue }), seededRng(7));
    expect(board.filter((q) => q.type === 'quick')).toHaveLength(4);
  });

  it('missed_day: the comeback quest after a single missed day', () => {
    const away2 = { activeDays: new Set(['2026-11-02']) }; // 11-03 missed
    expect(needsComeback(ctx(away2))).toBe(false);
    expect(needsComeback(ctx({ ...away2, challenge: 'missed_day' }))).toBe(true);
    expect(needsComeback(ctx({ challenge: 'missed_day' }))).toBe(false); // active yesterday
  });

  it('next_step: picking a next action weighs more', () => {
    const count = (challenge: BoardContext['challenge']) => {
      let n = 0;
      for (let seed = 0; seed < 300; seed++) {
        const board = planBoard(ctx({ challenge, habitsDue }), seededRng(seed));
        if (board.some((q) => q.templateKey === 'quick.pin_next')) n++;
      }
      return n;
    };
    expect(count('next_step')).toBeGreaterThan(count(null));
  });

  it('motivation: a daily quest doesn’t come back for a few days, when there are others', () => {
    const recent = new Map([
      ['daily.two_tasks:', addDays(TODAY, -2)],
      ['daily.focus_session:', addDays(TODAY, -3)],
    ]);
    for (let seed = 0; seed < 30; seed++) {
      const keys = planBoard(ctx({ challenge: 'motivation', lastOffered: recent }), seededRng(seed))
        .filter((q) => q.type === 'daily')
        .map(questKey);
      expect(keys).not.toContain('daily.two_tasks:');
      expect(keys).toHaveLength(GAME.quests.dailyPerDay);
    }
    // Without the challenge they may come back.
    const any = Array.from({ length: 30 }, (_, seed) =>
      planBoard(ctx({ lastOffered: recent }), seededRng(seed)).map(questKey),
    ).flat();
    expect(any).toContain('daily.two_tasks:');
  });
});

describe('habit XP can’t be farmed (D37)', () => {
  const check = (habit: string, createdOn?: string, day = TODAY) =>
    act('habit_checked', day, { date: day, projectId: null, habitCreatedOn: createdOn }, habit);

  it('a check-in on the day the habit was made earns nothing, but the day still counts', () => {
    const fresh = check('hab_new', TODAY);
    expect(xpCredits([fresh]).get(fresh.id)).toBe(0);
    expect(activeDaysOf([fresh]).has(TODAY)).toBe(true);
    // From the next day on it pays as usual.
    const tomorrow = addDays(TODAY, 1);
    const next = check('hab_new', TODAY, tomorrow);
    expect(xpCredits([fresh, next]).get(next.id)).toBe(GAME.xp.habitCheckin);
    // Check-ins logged before the rule (no creation day) keep their XP.
    const old = check('hab_old');
    expect(xpCredits([old]).get(old.id)).toBe(GAME.xp.habitCheckin);
  });

  it('habits earn at most the daily cap', () => {
    const yesterday = addDays(TODAY, -1);
    const checks = Array.from({ length: 8 }, (_, i) => check(`hab_${i}`, yesterday));
    const credits = xpCredits(checks);
    expect(totalXp(credits)).toBe(GAME.xp.habitDailyCap);
    expect(checks.map((c) => credits.get(c.id))).toEqual([10, 10, 10, 10, 10, 0, 0, 0]);
    // The next day starts over.
    const later = check('hab_0', yesterday, addDays(TODAY, 1));
    expect(xpCredits([...checks, later]).get(later.id)).toBe(10);
  });
});

describe('weekly review (D38)', () => {
  // Weeks start on Monday (1). 2026-11-02 is a Monday.
  it('reminds at the end of the week and on the next one’s first day', () => {
    const days = eachDay('2026-11-02', '2026-11-09');
    expect(days.map((d) => inReviewWindow(d, 1))).toEqual([
      true, // Mon: still the week before's review
      false,
      false,
      false,
      false,
      true, // Sat
      true, // Sun
      true, // next Mon
    ]);
  });

  it('a review on the first day of a week counts for the week before', () => {
    expect(reviewWeek('2026-11-07', 1)).toBe('2026-11-02'); // Saturday
    expect(reviewWeek('2026-11-09', 1)).toBe('2026-11-02'); // next Monday
    expect(reviewWeek('2026-11-10', 1)).toBe('2026-11-09');
    expect(reviewRange('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('earns once per week and makes the day active', () => {
    const r1 = act('review_completed', '2026-11-07', { weekStart: '2026-11-02' }, 'rev_1');
    const r2 = act('review_completed', '2026-11-08', { weekStart: '2026-11-02' }, 'rev_2');
    const credits = xpCredits([r1, r2]);
    expect([credits.get(r1.id), credits.get(r2.id)]).toEqual([GAME.xp.weeklyReview, 0]);
    expect(activeDaysOf([r1]).has('2026-11-07')).toBe(true);
    expect(affectedTemplates(r1)).toEqual(['review.weekly', 'weekly.target']);
  });

  it('offers one review quest a week, open through the next week’s first day', () => {
    const board = planBoard(
      ctx({ hasReviewQuest: false, hasDayBoard: true, hasWeekBoard: true }),
      seededRng(1),
    );
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({
      type: 'review',
      templateKey: 'review.weekly',
      periodStart: '2026-11-02',
      periodEnd: '2026-11-09',
      boxTier: 'large',
    });
    expect(
      planBoard(
        ctx({
          hasReviewQuest: false,
          restingTypes: ['review'],
          hasDayBoard: true,
          hasWeekBoard: true,
        }),
        seededRng(1),
      ),
    ).toEqual([]);
  });

  it('only this week’s review completes this week’s quest', () => {
    const q = stored(
      planBoard(
        ctx({ hasReviewQuest: false, hasDayBoard: true, hasWeekBoard: true }),
        seededRng(1),
      )[0]!,
      new Date('2026-11-02T09:00:00Z'),
    );
    const mine = act('review_completed', '2026-11-07', { weekStart: '2026-11-02' });
    const lastWeeks = act('review_completed', '2026-11-02', { weekStart: '2026-10-26' });
    expect(questProgress(q, [lastWeeks])).toBe(0);
    expect(questProgress(q, [lastWeeks, mine])).toBe(1);
  });
});

describe('work on every active project (D42)', () => {
  const weekly = (over: Partial<BoardContext> = {}) =>
    planBoard(
      ctx({ hasDayBoard: true, hasWeekBoard: true, hasProjectsQuest: false, ...over }),
      seededRng(1),
    ).find((q) => q.templateKey === 'weekly.projects');

  it('is offered once a week, with two or more active projects, even after the week board', () => {
    const q = weekly()!;
    expect(q).toMatchObject({
      type: 'weekly',
      target: 2,
      xp: 80,
      boxTier: 'large',
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
      params: { projectIds: ['prj_a', 'prj_b'] },
    });
    expect(weekly({ hasProjectsQuest: true })).toBeUndefined();
    expect(weekly({ projects: ctx().projects.slice(0, 1) })).toBeUndefined();
    expect(weekly({ restingTypes: ['weekly'] })).toBeUndefined();
  });

  it('counts a finished task or 10 minutes of focus in each project; a parked one is let off', () => {
    const q = stored(weekly()!, new Date('2026-11-02T00:00:00Z'));
    const shortFocus = act('focus_completed', TODAY, {
      minutes: 5,
      projectId: 'prj_b',
      taskId: null,
    });
    const acts = [done(TODAY, 'S', undefined, { projectId: 'prj_a' }), shortFocus];
    expect(questProgress(q, acts)).toBe(1);
    const longFocus = act('focus_completed', TODAY, {
      minutes: 10,
      projectId: 'prj_b',
      taskId: null,
    });
    expect(questProgress(q, [...acts, longFocus])).toBe(2);
    // prj_b was parked during the week.
    expect(questProgress(q, acts, { activeProjects: new Set(['prj_a']) })).toBe(2);
    expect(affectedTemplates(longFocus)).toContain('weekly.projects');
  });
});
