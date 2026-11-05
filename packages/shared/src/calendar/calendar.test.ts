import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  describeRecurrence,
  isSoon,
  nextOccurrence,
  occurrences,
  parseRRule,
  toRRule,
  type Recurrence,
} from '.';

// 2026-11-02 is a Monday.
const ev = (startDate: string, recurrence: Recurrence | null, skip: string[] = []) => ({
  startDate,
  recurrence,
  skip,
});

describe('RRULE', () => {
  it('round-trips the supported subset', () => {
    const rules: Recurrence[] = [
      { freq: 'daily', interval: 1 },
      { freq: 'weekly', interval: 2, byDay: [1, 3] },
      { freq: 'monthly', interval: 1, until: '2027-06-30' },
      { freq: 'yearly', interval: 1, count: 5 },
    ];
    for (const r of rules) expect(parseRRule(toRRule(r))).toEqual(r);
    expect(toRRule({ freq: 'weekly', interval: 2, byDay: [3, 1] })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
    );
    expect(toRRule({ freq: 'monthly', interval: 1, until: '2027-06-30' })).toBe(
      'FREQ=MONTHLY;UNTIL=20270630',
    );
  });

  it('rejects what it doesn’t understand', () => {
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('RRULE:FREQ=DAILY')).toEqual({ freq: 'daily', interval: 1 });
  });
});

describe('occurrences', () => {
  it('a one-off event has its start only', () => {
    expect(occurrences(ev('2026-11-05', null), '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
    expect(occurrences(ev('2026-12-05', null), '2026-11-01', '2026-11-30')).toEqual([]);
    expect(occurrences(ev('2026-11-05', null, ['2026-11-05']), '2026-11-01', '2026-11-30')).toEqual(
      [],
    );
  });

  it('weekly on several days, every 2 weeks, from the start’s week', () => {
    const r: Recurrence = { freq: 'weekly', interval: 2, byDay: [1, 3] };
    expect(occurrences(ev('2026-11-02', r), '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-16',
      '2026-11-18',
      '2026-11-30',
    ]);
  });

  it('weekly without days repeats the start’s weekday; nothing before the start', () => {
    const r: Recurrence = { freq: 'weekly', interval: 1 };
    expect(occurrences(ev('2026-11-04', r), '2026-10-01', '2026-11-18')).toEqual([
      '2026-11-04',
      '2026-11-11',
      '2026-11-18',
    ]);
  });

  it('a range far past the start still finds the right weeks', () => {
    const r: Recurrence = { freq: 'weekly', interval: 2, byDay: [1] };
    expect(occurrences(ev('2026-11-02', r), '2027-03-01', '2027-03-31')).toEqual([
      '2027-03-08',
      '2027-03-22',
    ]);
  });

  it('monthly skips months without the day; yearly on Feb 29 only in leap years', () => {
    const m: Recurrence = { freq: 'monthly', interval: 1 };
    expect(occurrences(ev('2026-01-31', m), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
    const y: Recurrence = { freq: 'yearly', interval: 1 };
    expect(occurrences(ev('2024-02-29', y), '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2028-02-29',
    ]);
  });

  it('until and count end the series; skipped dates still count', () => {
    const until: Recurrence = { freq: 'daily', interval: 1, until: '2026-11-04' };
    expect(occurrences(ev('2026-11-02', until), '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    const count: Recurrence = { freq: 'daily', interval: 2, count: 3 };
    expect(
      occurrences(ev('2026-11-02', count, ['2026-11-04']), '2026-11-03', '2026-11-30'),
    ).toEqual(['2026-11-06']);
  });

  it('finds the next occurrence', () => {
    const r: Recurrence = { freq: 'weekly', interval: 1, byDay: [5] };
    expect(nextOccurrence(ev('2026-11-02', r), '2026-11-04')).toBe('2026-11-06');
    expect(nextOccurrence(ev('2026-11-02', null), '2026-11-04')).toBeNull();
  });
});

describe('labels', () => {
  it('describe a rule', () => {
    expect(describeRecurrence({ freq: 'daily', interval: 1 }, '2026-11-02')).toBe('Every day');
    expect(describeRecurrence({ freq: 'weekly', interval: 1, byDay: [3, 1] }, '2026-11-02')).toBe(
      'Every week on Mon, Wed',
    );
    expect(describeRecurrence({ freq: 'weekly', interval: 2 }, '2026-11-04')).toBe(
      'Every 2 weeks on Wed',
    );
    expect(describeRecurrence({ freq: 'monthly', interval: 1, count: 6 }, '2026-11-05')).toBe(
      'Every month on day 5, 6 times',
    );
    expect(
      describeRecurrence({ freq: 'yearly', interval: 1, until: '2030-01-01' }, '2026-03-14'),
    ).toBe('Every year on Mar 14, until 2030-01-01');
  });

  it('count down in days', () => {
    expect(countdownLabel('2026-11-04', '2026-11-04')).toBe('Today');
    expect(countdownLabel('2026-11-04', '2026-11-05')).toBe('Tomorrow');
    expect(countdownLabel('2026-11-04', '2026-11-16')).toBe('In 12 days');
    expect(countdownLabel('2026-11-04', '2026-11-01')).toBe('3 days ago');
  });
});

describe('soon (D39)', () => {
  it('is today and the next three days, never the past', () => {
    expect(['2026-11-05', '2026-11-08'].map((d) => isSoon('2026-11-05', d))).toEqual([true, true]);
    expect(['2026-11-09', '2026-11-04'].map((d) => isSoon('2026-11-05', d))).toEqual([
      false,
      false,
    ]);
  });
});
