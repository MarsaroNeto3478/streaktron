import { describe, expect, it } from 'vitest';
import { dueOn, habitStreak, recentDays, scheduleLabel, type HabitSchedule } from '.';

// 2026-11-02 is a Monday.
const MON = '2026-11-02';
const days = (...d: string[]) => new Set(d);
const mwf: HabitSchedule = { type: 'weekdays', days: [1, 3, 5] };
const thrice: HabitSchedule = { type: 'per_week', count: 3 };

describe('schedules', () => {
  it('have readable labels', () => {
    expect(scheduleLabel({ type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
    expect(scheduleLabel({ type: 'weekdays', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
    expect(scheduleLabel({ type: 'weekdays', days: [0, 6] })).toBe('Weekends');
    expect(scheduleLabel(mwf)).toBe('Mon, Wed, Fri');
    expect(scheduleLabel({ type: 'weekdays', days: [0, 1] }, 0)).toBe('Sun, Mon');
    expect(scheduleLabel({ type: 'weekdays', days: [0, 1] }, 1)).toBe('Mon, Sun');
    expect(scheduleLabel(thrice)).toBe('3× a week');
  });

  it('weekday habits are due on their days, and stay listed once checked', () => {
    expect(dueOn(mwf, MON, days(), 1)).toBe(true);
    expect(dueOn(mwf, '2026-11-03', days(), 1)).toBe(false);
    expect(dueOn(mwf, '2026-11-03', days('2026-11-03'), 1)).toBe(true);
  });

  it('per-week habits are due until the week’s count is reached', () => {
    const done = days(MON, '2026-11-03', '2026-11-04');
    expect(dueOn(thrice, '2026-11-04', days(MON), 1)).toBe(true);
    expect(dueOn(thrice, '2026-11-05', done, 1)).toBe(false);
    expect(dueOn(thrice, '2026-11-04', done, 1)).toBe(true); // checked that day
    expect(dueOn(thrice, '2026-11-09', done, 1)).toBe(true); // a new week
  });
});

describe('habit streaks', () => {
  it('count scheduled days in a row; today only adds', () => {
    // Mon, Wed, Fri checked; today is the next Monday, not checked yet.
    const checked = days(MON, '2026-11-04', '2026-11-06');
    expect(habitStreak(mwf, checked, '2026-11-09', 1, MON)).toEqual({
      current: 3,
      longest: 3,
      unit: 'day',
    });
    expect(habitStreak(mwf, days(...checked, '2026-11-09'), '2026-11-09', 1, MON).current).toBe(4);
  });

  it('a missed scheduled day breaks the run; off days don’t', () => {
    const checked = days(MON, '2026-11-06', '2026-11-09');
    expect(habitStreak(mwf, checked, '2026-11-09', 1, MON)).toEqual({
      current: 2,
      longest: 2,
      unit: 'day',
    });
  });

  it('per-week habits count weeks that reached the count; this week only adds', () => {
    const checked = days(MON, '2026-11-03', '2026-11-04', '2026-11-09');
    expect(habitStreak(thrice, checked, '2026-11-10', 1, MON)).toEqual({
      current: 1,
      longest: 1,
      unit: 'week',
    });
    const missed = days(MON);
    expect(habitStreak(thrice, missed, '2026-11-10', 1, MON).current).toBe(0);
  });

  it('nothing before the habit started breaks it', () => {
    expect(habitStreak(mwf, days('2026-11-06'), '2026-11-06', 1, '2026-11-05').current).toBe(1);
  });
});

describe('recent days', () => {
  it('lists the last week oldest first', () => {
    const r = recentDays(mwf, days(MON), '2026-11-04', 3);
    expect(r).toEqual([
      { day: MON, checked: true, scheduled: true },
      { day: '2026-11-03', checked: false, scheduled: false },
      { day: '2026-11-04', checked: false, scheduled: true },
    ]);
  });
});
