import { describe, expect, it } from 'vitest';
import { addDays } from '../time';
import type { Activity, ActivityPayloads, ActivityType } from './activity';
import { statsOverview, streakRuns } from './stats';

let seq = 0;
function act<T extends ActivityType>(type: T, localDate: string, payload: ActivityPayloads[T]) {
  return {
    id: `act_${String(++seq).padStart(6, '0')}`,
    type,
    entityId: `e${seq}`,
    localDate,
    occurredAt: new Date(`${localDate}T12:00:00Z`),
    payload,
  } as Activity;
}
const task = (day: string) =>
  act('task_completed', day, { effort: 'S', projectId: null, subtask: false });
const taskAgain = (day: string, of: Activity) => ({ ...task(day), entityId: of.entityId });
const focus = (day: string, minutes: number, projectId: string | null = 'prj_a') =>
  act('focus_completed', day, { minutes, projectId, taskId: null });

describe('stats (D50)', () => {
  it('splits the weeks, totals them and compares with the weeks before', () => {
    // Weeks start on Monday; 2026-11-14 is a Saturday, so this week starts 2026-11-09.
    const acts = [
      task('2026-11-10'),
      focus('2026-11-10', 30),
      focus('2026-11-03', 45, null),
      task('2026-10-20'), // the weeks before the window (2 weeks: from 2026-11-02)
    ];
    acts.push(taskAgain('2026-11-11', acts[0]!)); // reopened and done again: still one
    const s = statsOverview(acts, { today: '2026-11-14', weekStart: 1, weeks: 2 });
    expect(s.from).toBe('2026-11-02');
    expect(s.weeks.map((w) => [w.start, w.focusMinutes, w.tasks, w.activeDays])).toEqual([
      ['2026-11-02', 45, 0, 1],
      ['2026-11-09', 30, 1, 2], // Nov 11 still counts as an active day
    ]);
    expect(s.totals).toMatchObject({ focusMinutes: 75, tasks: 1, activeDays: 3 });
    expect(s.previous).toMatchObject({ tasks: 1, activeDays: 1 });
    expect(s.focusByProject).toEqual([
      { projectId: null, minutes: 45 },
      { projectId: 'prj_a', minutes: 30 },
    ]);
    expect(s.totals.xp).toBeGreaterThan(0);
  });

  it('finds the streak runs, a freeze bridging a missed day', () => {
    const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
    // Oct 1–7 active (a freeze earned), Oct 8 missed (frozen), Oct 9 active, Oct 10–11 missed.
    // Then Nov 12–14, still going.
    const active = new Set([...days('2026-10-01', 7), '2026-10-09', ...days('2026-11-12', 3)]);
    expect(streakRuns(active, '2026-11-14')).toEqual([
      { start: '2026-10-01', end: '2026-10-09', days: 8, current: false },
      { start: '2026-11-12', end: '2026-11-14', days: 3, current: true },
    ]);
    expect(streakRuns(new Set(['2026-11-13']), '2026-11-14')).toEqual([
      { start: '2026-11-13', end: '2026-11-13', days: 1, current: true },
    ]);
  });
});
