import { describe, expect, it } from 'vitest';
import { hiddenUntil, INBOX_TIP_AT, pickTip, tipsFor, type TipInput } from '.';

const input = (over: Partial<TipInput> = {}): TipInput => ({
  today: '2026-11-14',
  challenge: null,
  activeProjects: [{ id: 'prj_a', title: 'Thesis', openTasks: 3, hasNextAction: true }],
  inboxCount: 0,
  focusEmpty: false,
  streak: { current: 4, activeToday: true },
  lateInDay: false,
  hiddenUntil: {},
  ...over,
});
const ids = (i: TipInput) => tipsFor(i).map((t) => t.id.split(':')[0]);

describe('Streaky’s tips (D46)', () => {
  it('gives general advice when nothing is wrong, tuned to the challenge', () => {
    expect(ids(input())).toEqual(['general']);
    const a = pickTip(input({ challenge: 'too_many' }))!;
    const b = pickTip(input({ challenge: 'too_many', today: '2026-11-15' }))!;
    expect([a.title, b.title].sort()).toEqual([
      'Fewer projects, more progress',
      'Finish before you start',
    ]);
  });

  it('puts what needs attention first', () => {
    const i = input({
      streak: { current: 4, activeToday: false },
      lateInDay: true,
      activeProjects: [
        { id: 'prj_a', title: 'Thesis', openTasks: 0, hasNextAction: false },
        { id: 'prj_b', title: 'Site', openTasks: 2, hasNextAction: false },
      ],
      inboxCount: INBOX_TIP_AT,
    });
    expect(ids(i)).toEqual(['streak', 'next', 'next', 'inbox', 'general']);
    expect(tipsFor(i)[1]!.title).toBe('“Thesis” has nothing to do');
    expect(tipsFor(i)[2]!.title).toBe('What’s next on “Site”?');
  });

  it('warns about the streak only late in the day and when today has not counted', () => {
    expect(ids(input({ streak: { current: 4, activeToday: false } }))).toEqual(['general']);
    expect(ids(input({ streak: { current: 0, activeToday: false }, lateInDay: true }))).toEqual([
      'general',
    ]);
  });

  it('points to projects when Today is empty and none is active', () => {
    expect(ids(input({ activeProjects: [], focusEmpty: true }))[0]).toBe('no-active-project');
    expect(ids(input({ inboxCount: INBOX_TIP_AT - 1 }))).toEqual(['general']);
  });

  it('skips a tip put away until its day comes back', () => {
    const i = input({ inboxCount: 12 });
    const inbox = pickTip(i)!;
    expect(inbox.id).toBe('inbox');
    const until = hiddenUntil(inbox, i.today);
    expect(until).toBe('2026-11-17');
    expect(pickTip({ ...i, hiddenUntil: { inbox: until } })!.id).toMatch(/^general:/);
    expect(pickTip({ ...i, today: until, hiddenUntil: { inbox: until } })!.id).toBe('inbox');
    // Every tip put away: nothing to show.
    const g = pickTip(input())!;
    expect(pickTip(input({ hiddenUntil: { [g.id]: hiddenUntil(g, '2026-11-14') } }))).toBeNull();
  });
});
