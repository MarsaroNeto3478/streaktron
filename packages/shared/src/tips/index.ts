// Streaky's tips (D31, D46): one tip at a time on Today, picked from what the page already knows.
// Pure, so the rules stay testable; the web app keeps which tips were put away (per browser).

import type { Challenge } from '../game/challenge';
import { addDays, type DateString } from '../time';

export type TipMood = 'happy' | 'worried' | 'thinking';

export type TipAction =
  | { kind: 'project'; projectId: string }
  | { kind: 'link'; to: '/inbox' | '/projects' }
  | { kind: 'focus' };

export interface Tip {
  /** Stable id: putting a tip away hides this id. */
  id: string;
  mood: TipMood;
  title: string;
  body: string;
  action?: TipAction & { label: string };
  /** Days a put-away tip stays hidden. */
  snoozeDays: number;
}

export interface TipInput {
  today: DateString;
  challenge: Challenge | null;
  activeProjects: { id: string; title: string; openTasks: number; hasNextAction: boolean }[];
  inboxCount: number;
  /** Today's focus list is empty. */
  focusEmpty: boolean;
  streak: { current: number; activeToday: boolean };
  /** It's the evening of the user's day. */
  lateInDay: boolean;
  /** Tip id → the first day it shows again. */
  hiddenUntil: Record<string, DateString>;
}

/** An inbox this big is worth sorting. */
export const INBOX_TIP_AT = 10;

/** General advice, one set per challenge (D32); rotates by day when nothing more pressing applies. */
const GENERAL: Record<Challenge | 'none', { title: string; body: string }[]> = {
  forgetting: [
    {
      title: 'Make starting tiny',
      body: 'Pick a task you can begin in two minutes. Once you’ve started, keeping going is the easy part.',
    },
    {
      title: 'Same time, same place',
      body: 'Studying at a fixed time turns it into a habit you don’t have to remember.',
    },
  ],
  next_step: [
    {
      title: 'Name the very next step',
      body: 'Not “study calculus” but “do exercise 3 on page 42”. A step that concrete is easy to start.',
    },
    {
      title: 'Pin a next action',
      body: 'On a project’s board, pin the task you’ll do next. Today shows it first.',
    },
  ],
  missed_day: [
    {
      title: 'A missed day isn’t the end',
      body: 'Streaks here forgive: freezes cover a missed day, and coming back always counts.',
    },
    {
      title: 'Never miss twice',
      body: 'One day off happens. What matters is doing something small the next day.',
    },
  ],
  too_many: [
    {
      title: 'Fewer projects, more progress',
      body: 'Park a project you aren’t really working on. It waits for you, and the rest gets your attention.',
    },
    {
      title: 'Finish before you start',
      body: 'Before a new project, ask which active one you could close or park first.',
    },
  ],
  motivation: [
    {
      title: 'Look how far you’ve come',
      body: 'Stats shows every active day. Small days add up more than it feels.',
    },
    {
      title: 'Action comes before motivation',
      body: 'Ten minutes of focus often brings the will to keep going, not the other way around.',
    },
  ],
  none: [
    {
      title: 'One thing at a time',
      body: 'Start a focus session on a single task. Switching costs more than it seems.',
    },
    {
      title: 'Small and often',
      body: 'Twenty minutes every day beats three hours once a week.',
    },
  ],
};

/** Every tip that applies now, most pressing first. */
export function tipsFor(i: TipInput): Tip[] {
  const tips: Tip[] = [];

  if (i.streak.current > 0 && !i.streak.activeToday && i.lateInDay) {
    tips.push({
      id: `streak:${i.today}`,
      mood: 'worried',
      title: `Your ${i.streak.current}-day streak needs today`,
      body: 'Nothing has counted yet today. One task done or ten minutes of focus keeps it going.',
      action: { kind: 'focus', label: 'Focus for 10 minutes' },
      snoozeDays: 1,
    });
  }

  for (const p of i.activeProjects) {
    if (p.hasNextAction) continue;
    tips.push({
      id: `next:${p.id}`,
      mood: 'thinking',
      title: p.openTasks === 0 ? `“${p.title}” has nothing to do` : `What’s next on “${p.title}”?`,
      body:
        p.openTasks === 0
          ? 'An active project with no tasks can’t move. Add the next small step, or park it.'
          : 'None of its tasks is ready to be next. Open the board and pick one.',
      action: { kind: 'project', projectId: p.id, label: 'Open the project' },
      snoozeDays: 3,
    });
  }

  if (i.focusEmpty && i.activeProjects.length === 0) {
    tips.push({
      id: 'no-active-project',
      mood: 'thinking',
      title: 'No active project',
      body: 'Today fills itself from your active projects. Start one, or bring back one you parked.',
      action: { kind: 'link', to: '/projects', label: 'See projects' },
      snoozeDays: 3,
    });
  }

  if (i.inboxCount >= INBOX_TIP_AT) {
    tips.push({
      id: 'inbox',
      mood: 'thinking',
      title: `${i.inboxCount} tasks are waiting in the inbox`,
      body: 'Move a few into their projects, or delete what no longer matters. A short inbox is a calm one.',
      action: { kind: 'link', to: '/inbox', label: 'Sort the inbox' },
      snoozeDays: 3,
    });
  }

  const general = GENERAL[i.challenge ?? 'none'];
  const g = general[Number(i.today.replaceAll('-', '')) % general.length]!;
  tips.push({ id: `general:${i.today}`, mood: 'happy', ...g, snoozeDays: 1 });

  return tips;
}

/** The tip to show: the most pressing one not put away. */
export function pickTip(i: TipInput): Tip | null {
  return tipsFor(i).find((t) => !((i.hiddenUntil[t.id] ?? '') > i.today)) ?? null;
}

/** The first day a tip put away today shows again. */
export const hiddenUntil = (tip: Tip, today: DateString): DateString =>
  addDays(today, tip.snoozeDays);
