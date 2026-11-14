import { describe, expect, it } from 'vitest';
import { addDays } from '../time';
import { ACHIEVEMENTS, achievementStatus, type AchievementStatus } from './achievements';
import type { Activity, ActivityPayloads, ActivityType } from './activity';

let seq = 0;
function act<T extends ActivityType>(
  type: T,
  localDate: string,
  payload: ActivityPayloads[T],
  entityId: string | null = `e${++seq}`,
): Activity {
  return {
    id: `act_${String(++seq).padStart(6, '0')}`,
    type,
    entityId,
    localDate,
    occurredAt: new Date(`${localDate}T12:00:00Z`),
    payload,
  } as Activity;
}
const task = (day: string, id?: string, subtask = false) =>
  act('task_completed', day, { effort: null, projectId: null, subtask }, id);

const settings = { today: '2026-11-14', weekStart: 1, weeklyActiveDayTarget: 3 };
const status = (acts: Activity[], today = settings.today) =>
  new Map<string, AchievementStatus>(
    achievementStatus(acts, { ...settings, today }).map((s) => [s.key, s]),
  );

describe('achievements (D49)', () => {
  it('has unique keys, tiers in order', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.find((a) => a.key === 'tasks.10')).toMatchObject({
      kind: 'medal',
      tier: 2,
    });
    expect(ACHIEVEMENTS.find((a) => a.key === 'daily_streak.7')?.kind).toBe('prize');
  });

  it('counts each task once, not subtasks, with the day the target was reached', () => {
    const acts = [
      task('2026-11-01', 'tsk_a'),
      task('2026-11-01', 'tsk_a'), // completed again after a reopen: still one
      task('2026-11-02', 'tsk_b', true), // a subtask
      ...Array.from({ length: 9 }, (_, i) => task(addDays('2026-11-03', i))),
    ];
    const s = status(acts);
    expect(s.get('tasks.1')).toEqual({ key: 'tasks.1', value: 10, reachedOn: '2026-11-01' });
    expect(s.get('tasks.10')?.reachedOn).toBe('2026-11-11');
    expect(s.get('tasks.100')).toMatchObject({ value: 10, reachedOn: null });
  });

  it('adds focus minutes into hours, and counts reviews by week', () => {
    const acts = [
      act('focus_completed', '2026-11-01', { minutes: 40, projectId: null, taskId: null }),
      act('focus_completed', '2026-11-03', { minutes: 25, projectId: null, taskId: null }),
      act('review_completed', '2026-11-08', { weekStart: '2026-11-02' }),
    ];
    const s = status(acts);
    expect(s.get('focus.1')).toMatchObject({ value: 1, reachedOn: '2026-11-03' });
    expect(s.get('reviews.1')?.reachedOn).toBe('2026-11-08');
  });

  it('finds the day a streak milestone was reached, freezes included', () => {
    // Active Oct 1–7 (the 7th day earns a freeze), Oct 8 missed (frozen), Oct 9 active.
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-10-01', i));
    const acts = [...days.map((d) => task(d)), task('2026-10-09')];
    const s = status(acts, '2026-10-20');
    expect(s.get('daily_streak.7')).toMatchObject({ value: 8, reachedOn: '2026-10-07' });
    expect(s.get('daily_streak.30')?.reachedOn).toBeNull();
  });

  it('skips replays and finds comebacks, sweeps and levels', () => {
    const acts = [
      act('quest_completed', '2026-11-01', {
        questType: 'tutorial',
        xp: 0,
        boxTier: 'small',
        replay: true,
      }),
      act('quest_completed', '2026-11-02', { questType: 'comeback', xp: 50, boxTier: 'standard' }),
      act('quest_bonus', '2026-11-02', { xp: 20 }),
    ];
    const s = status(acts);
    expect(s.get('quests.1')).toMatchObject({ value: 1, reachedOn: '2026-11-02' });
    expect(s.get('comeback.1')?.reachedOn).toBe('2026-11-02');
    expect(s.get('sweeps.1')?.reachedOn).toBe('2026-11-02');
    expect(s.get('level.5')?.reachedOn).toBeNull();
  });
});
