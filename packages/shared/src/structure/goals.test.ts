import { describe, expect, it } from 'vitest';
import { commitmentProgress, goalMinutesFrom, goalPeriodOf, type CommitmentInput } from './goals';

// 2026-11-02 is a Monday; weeks start on Monday (1).
const base = (over: Partial<CommitmentInput> = {}): CommitmentInput => ({
  today: '2026-11-05', // Thursday: 3 days done, 4 left
  period: 'week',
  weekStart: 1,
  target: 240,
  until: null,
  createdOn: '2026-10-01',
  minutesByDay: new Map(),
  ...over,
});
const mins = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('goal periods', () => {
  it('are the user’s week or the calendar month', () => {
    expect(goalPeriodOf('2026-11-05', 'week', 1)).toEqual({
      start: '2026-11-02',
      end: '2026-11-09',
    });
    expect(goalPeriodOf('2026-11-05', 'week', 0)).toEqual({
      start: '2026-11-01',
      end: '2026-11-08',
    });
    expect(goalPeriodOf('2026-12-31', 'month', 1)).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    });
  });

  it('look back from the period the goal was created in, at most a year of weeks', () => {
    expect(goalMinutesFrom('2026-11-05', 'week', 1, '2026-10-21')).toBe('2026-10-19');
    expect(goalMinutesFrom('2026-11-05', 'week', 1, '2020-01-01')).toBe('2025-11-03');
  });
});

describe('commitment progress (D40)', () => {
  it('sums this period’s focus and asks for the rest spread over the days left', () => {
    const p = commitmentProgress(
      base({ minutesByDay: mins({ '2026-11-01': 500, '2026-11-02': 60, '2026-11-05': 30 }) }),
    );
    expect(p).toMatchObject({ start: '2026-11-02', end: '2026-11-09', minutes: 90, daysLeft: 4 });
    expect(p.perDay).toBe(38); // 150 left over 4 days, rounded up
    expect(p.expected).toBe(103); // 3 of 7 days of 240
    expect(p.pace).toBe('behind');
  });

  it('is on track at an even pace, and done at the target', () => {
    expect(commitmentProgress(base({ minutesByDay: mins({ '2026-11-03': 103 }) })).pace).toBe(
      'on_track',
    );
    // The first day of a period is always on track.
    expect(commitmentProgress(base({ today: '2026-11-02' })).pace).toBe('on_track');
    const done = commitmentProgress(base({ minutesByDay: mins({ '2026-11-03': 250 }) }));
    expect(done).toMatchObject({ pace: 'done', perDay: 0 });
  });

  it('counts a streak of periods met, and keeps it while this one is still open', () => {
    const minutesByDay = mins({
      '2026-10-13': 240, // week of Oct 12: met
      '2026-10-20': 100, // week of Oct 19: missed
      '2026-10-27': 240, // week of Oct 26: met
    });
    const open = commitmentProgress(base({ minutesByDay }));
    expect(open.streak).toBe(1);
    expect(open.history.map((h) => [h.start, h.met])).toEqual([
      ['2026-10-05', false],
      ['2026-10-12', true],
      ['2026-10-19', false],
      ['2026-10-26', true],
    ]);
    minutesByDay.set('2026-11-04', 240);
    expect(commitmentProgress(base({ minutesByDay })).streak).toBe(2);
  });

  it('ignores periods that ended before the goal existed', () => {
    const p = commitmentProgress(
      base({ createdOn: '2026-10-28', minutesByDay: mins({ '2026-10-20': 999 }) }),
    );
    expect(p.history.map((h) => h.start)).toEqual(['2026-10-26']);
    expect(p.streak).toBe(0);
  });

  it('a monthly goal paces over the month', () => {
    const p = commitmentProgress(
      base({ period: 'month', target: 600, minutesByDay: mins({ '2026-11-01': 120 }) }),
    );
    expect(p).toMatchObject({ start: '2026-11-01', end: '2026-12-01', daysLeft: 26, perDay: 19 });
  });

  it('stops at its end date, and shows its last period once over', () => {
    const cut = commitmentProgress(base({ until: '2026-11-06' }));
    expect(cut).toMatchObject({ end: '2026-11-07', daysLeft: 2, perDay: 120 });
    const over = commitmentProgress(
      base({ until: '2026-10-28', minutesByDay: mins({ '2026-10-27': 60 }) }),
    );
    expect(over).toMatchObject({
      start: '2026-10-26',
      end: '2026-10-29',
      minutes: 60,
      pace: 'ended',
      daysLeft: 0,
      perDay: 0,
    });
  });
});
