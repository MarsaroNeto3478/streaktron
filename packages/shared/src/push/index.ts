// Reminders (Phase 4, D45): Web Push to the user's devices. Pure rules: which reminders are due at
// a moment, and what they say. The server runs them every few minutes and sends each kind at most
// once per user day; the focus-ended push is sent when a session's time is up.

import { z } from 'zod';
import type { DateString } from '../time';

export const REMINDER_KINDS = ['habits', 'streak'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const hour = z.int().min(0).max(23);

export const remindersSchema = z.object({
  /** Habits due today and not checked in yet, at this hour. */
  habits: z.object({ on: z.boolean(), hour }),
  /** "Streak at risk": nothing counted today yet and a streak to keep (opt-in, at most once a day). */
  streak: z.object({ on: z.boolean(), hour }),
  /** A focus session's time is up. */
  focus: z.boolean(),
});
export type Reminders = z.infer<typeof remindersSchema>;

export const DEFAULT_REMINDERS: Reminders = {
  habits: { on: true, hour: 20 },
  streak: { on: false, hour: 21 },
  focus: true,
};

/** Hours since the user's day started, so a reminder at 1:00 with a 4:00 day start is late in the day. */
const dayHour = (h: number, dayStartHour: number) => (h - dayStartHour + 24) % 24;

export interface ReminderInput {
  reminders: Reminders;
  /** The user's wall-clock hour now, and when their day starts. */
  hour: number;
  dayStartHour: number;
  /** Kinds already sent today. */
  sentToday: ReadonlySet<ReminderKind>;
  /** Habits due today, not checked in yet. */
  habitsLeft: readonly string[];
  /** Today already counts as an active day. */
  todayActive: boolean;
  /** The daily streak that today would continue (0: none to lose). */
  streak: number;
}

export interface ReminderMessage {
  kind: ReminderKind;
  title: string;
  body: string;
  /** Where tapping it goes. */
  url: string;
}

/** The reminders due now: their hour has come in the user's day, not sent today, still relevant. */
export function dueReminders(i: ReminderInput): ReminderMessage[] {
  const now = dayHour(i.hour, i.dayStartHour);
  const reached = (h: number) => now >= dayHour(h, i.dayStartHour);
  const out: ReminderMessage[] = [];
  const { habits, streak } = i.reminders;

  if (habits.on && reached(habits.hour) && !i.sentToday.has('habits') && i.habitsLeft.length) {
    const n = i.habitsLeft.length;
    out.push({
      kind: 'habits',
      title: n === 1 ? `“${i.habitsLeft[0]}” is still open today` : `${n} habits still open today`,
      body: n === 1 ? 'A quick check-in keeps it going.' : i.habitsLeft.slice(0, 4).join(' · '),
      url: '/habits',
    });
  }
  if (
    streak.on &&
    reached(streak.hour) &&
    !i.sentToday.has('streak') &&
    !i.todayActive &&
    i.streak > 0
  ) {
    out.push({
      kind: 'streak',
      title: `Your ${i.streak}-day streak is waiting`,
      body: 'Ten minutes of focus, a task or a habit keeps it alive today.',
      url: '/today',
    });
  }
  return out;
}

/** The push for a focus session whose time is up. */
export function focusEndedMessage(minutes: number, what: string | null) {
  return {
    title: 'Focus time is up',
    body: what
      ? `${minutes} min on “${what}”. Finish it to count it.`
      : `${minutes} min done. Finish it to count it.`,
    url: '/today',
  };
}

/** A push subscription as the browser gives it (PushSubscription.toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(2000) });

/** The day key that makes a reminder once per user day. */
export const sentKey = (kind: ReminderKind, day: DateString) => `${kind}:${day}`;
