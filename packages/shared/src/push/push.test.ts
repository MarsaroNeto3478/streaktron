import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDERS, dueReminders, type ReminderInput } from '.';

const input = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  reminders: { ...DEFAULT_REMINDERS, streak: { on: true, hour: 21 } },
  hour: 22,
  dayStartHour: 4,
  sentToday: new Set(),
  habitsLeft: ['Read', 'Run'],
  todayActive: false,
  streak: 5,
  ...over,
});
const kinds = (i: ReminderInput) => dueReminders(i).map((m) => m.kind);

describe('reminders (D45)', () => {
  it('are due once their hour has come, and say what is left', () => {
    expect(kinds(input({ hour: 19 }))).toEqual([]);
    expect(kinds(input({ hour: 20 }))).toEqual(['habits']);
    const [habits, streak] = dueReminders(input());
    expect(habits).toMatchObject({ title: '2 habits still open today', body: 'Read · Run' });
    expect(streak).toMatchObject({ title: 'Your 5-day streak is waiting', url: '/today' });
    expect(dueReminders(input({ habitsLeft: ['Read'] }))[0]!.title).toBe(
      '“Read” is still open today',
    );
  });

  it('count hours in the user’s day: past midnight is still late, not early', () => {
    // Day starts at 4:00; at 1:00 the 20:00 reminder is due, at 5:00 (a new day) it isn't.
    expect(kinds(input({ hour: 1 }))).toEqual(['habits', 'streak']);
    expect(kinds(input({ hour: 5 }))).toEqual([]);
  });

  it('go only when relevant, once a day, and the streak one only when asked for', () => {
    expect(kinds(input({ sentToday: new Set(['habits']) }))).toEqual(['streak']);
    expect(kinds(input({ habitsLeft: [] }))).toEqual(['streak']);
    expect(kinds(input({ todayActive: true }))).toEqual(['habits']);
    expect(kinds(input({ streak: 0 }))).toEqual(['habits']);
    expect(kinds(input({ reminders: DEFAULT_REMINDERS }))).toEqual(['habits']);
    expect(
      kinds(input({ reminders: { ...DEFAULT_REMINDERS, habits: { on: false, hour: 20 } } })),
    ).toEqual([]);
  });
});
