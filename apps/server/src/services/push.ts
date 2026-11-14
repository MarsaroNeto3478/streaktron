// Web Push (Phase 4, D45): the devices that accepted notifications, and what is sent to them.
// A job runs every minute: focus sessions whose time is up get one push each, and the day's
// reminders (habits left, streak at risk) go out once per user day when their hour comes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from '@strekatron/shared/ids';
import {
  dueReminders,
  focusEndedMessage,
  REMINDER_KINDS,
  sentKey,
  type PushSubscriptionInput,
  type ReminderKind,
} from '@strekatron/shared/push';
import { wallClock } from '@strekatron/shared/time';
import { and, eq, inArray, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '../db/client';
import {
  focusSessions,
  projects,
  pushSent,
  pushSubscriptions,
  tasks,
  userSettings,
} from '../db/schema';
import { env } from '../env';
import { dayOf } from './activity';
import { getGameState } from './game';
import { habitsDueToday } from './habits';

// --- Keys ------------------------------------------------------------------------------------

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: VapidKeys | null = null;

/**
 * The server's VAPID keys: from the environment, or made once and kept in the data folder (a new
 * pair would orphan every device's subscription).
 */
export function vapidKeys(): VapidKeys {
  if (keys) return keys;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  } else {
    const file = join(env.DATA_DIR, 'vapid.json');
    if (existsSync(file)) {
      keys = JSON.parse(readFileSync(file, 'utf8')) as VapidKeys;
    } else {
      keys = webpush.generateVAPIDKeys();
      mkdirSync(env.DATA_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    }
  }
  return keys;
}

// --- Sending ---------------------------------------------------------------------------------

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Same tag, same notification: a newer one replaces it. */
  tag: string;
}

type Sub = typeof pushSubscriptions.$inferSelect;
/** Sends one message to one device; resolves to the push service's status code. */
export type Sender = (sub: Sub, message: PushMessage) => Promise<number>;

const webPushSender: Sender = async (sub, message) => {
  const k = vapidKeys();
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        TTL: 60 * 60,
        vapidDetails: {
          subject: env.VAPID_SUBJECT,
          publicKey: k.publicKey,
          privateKey: k.privateKey,
        },
      },
    );
    return res.statusCode;
  } catch (err) {
    if (err instanceof webpush.WebPushError) return err.statusCode;
    throw err;
  }
};

let sender: Sender = webPushSender;

/** Tests replace the sender; nothing leaves the machine. */
export function setSender(s: Sender | null) {
  sender = s ?? webPushSender;
}

/** Send to every device of the user; devices the push service says are gone are forgotten. */
export async function sendToUser(userId: string, message: PushMessage): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  for (const sub of subs) {
    let status: number;
    try {
      status = await sender(sub, message);
    } catch (err) {
      console.error('[push] send failed', err);
      continue;
    }
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    } else if (status >= 200 && status < 300) {
      delivered++;
      await db
        .update(pushSubscriptions)
        .set({ lastSentAt: new Date() })
        .where(eq(pushSubscriptions.id, sub.id));
    } else {
      console.warn(`[push] ${status} from the push service`);
    }
  }
  return delivered;
}

/** Claim a send key; false when it was sent already. */
async function claim(userId: string, key: string): Promise<boolean> {
  const rows = await db
    .insert(pushSent)
    .values({ userId, key })
    .onConflictDoNothing()
    .returning({ key: pushSent.key });
  return rows.length > 0;
}

// --- Devices ---------------------------------------------------------------------------------

export async function subscribe(userId: string, input: PushSubscriptionInput, userAgent?: string) {
  const values = {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
  };
  // The endpoint is the browser's; if another account had it on this browser, it moves here.
  await db
    .insert(pushSubscriptions)
    .values({ id: newId('pushSubscription'), ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return { devices: await deviceCount(userId) };
}

export async function unsubscribe(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  return { devices: await deviceCount(userId) };
}

export async function deviceCount(userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return row?.n ?? 0;
}

export async function sendTest(userId: string) {
  return {
    delivered: await sendToUser(userId, {
      title: 'Notifications are on',
      body: 'Strekatron will remind you here.',
      url: '/settings',
      tag: 'strekatron-test',
    }),
  };
}

// --- The minute job --------------------------------------------------------------------------

/** Focus sessions whose time is up, for users with a device: one push each. */
async function focusEnded(now: Date) {
  const due = await db
    .select({
      id: focusSessions.id,
      userId: focusSessions.userId,
      minutes: focusSessions.plannedMinutes,
      task: tasks.title,
      project: projects.title,
      reminders: userSettings.reminders,
    })
    .from(focusSessions)
    .innerJoin(userSettings, eq(userSettings.userId, focusSessions.userId))
    .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .leftJoin(projects, eq(projects.id, focusSessions.projectId))
    .where(
      and(
        eq(focusSessions.status, 'running'),
        sql`${focusSessions.startedAt} + make_interval(secs => ${focusSessions.pausedMs} / 1000.0) + make_interval(mins => ${focusSessions.plannedMinutes}) <= ${now}`,
        sql`exists (select 1 from push_subscriptions s where s.user_id = ${focusSessions.userId})`,
      ),
    );
  let sent = 0;
  for (const s of due) {
    if (!s.reminders.focus || !(await claim(s.userId, `focus:${s.id}`))) continue;
    const m = focusEndedMessage(s.minutes, s.task ?? s.project);
    await sendToUser(s.userId, { ...m, tag: 'strekatron-focus' });
    sent++;
  }
  return sent;
}

/** The day's reminders for every user with a device. */
async function dailyReminders(now: Date) {
  const users = await db
    .selectDistinct({
      userId: userSettings.userId,
      timezone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      reminders: userSettings.reminders,
    })
    .from(userSettings)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, userSettings.userId));
  let sent = 0;
  for (const u of users) {
    const { habits, streak } = u.reminders;
    if (!habits.on && !streak.on) continue;
    const today = dayOf(u, now);
    const already = await db
      .select({ key: pushSent.key })
      .from(pushSent)
      .where(
        and(
          eq(pushSent.userId, u.userId),
          inArray(
            pushSent.key,
            REMINDER_KINDS.map((k) => sentKey(k, today)),
          ),
        ),
      );
    const sentToday = new Set(already.map((r) => r.key.split(':')[0] as ReminderKind));
    if (sentToday.size === REMINDER_KINDS.length) continue;
    const [left, state] = await Promise.all([habitsDueToday(db, u.userId), getGameState(u.userId)]);
    const due = dueReminders({
      reminders: u.reminders,
      hour: wallClock(now, u.timezone).hour,
      dayStartHour: u.dayStartHour,
      sentToday,
      habitsLeft: left.map((h) => h.title),
      todayActive: state.daily.activeToday,
      streak: state.daily.current,
    });
    for (const m of due) {
      if (!(await claim(u.userId, sentKey(m.kind, today)))) continue;
      await sendToUser(u.userId, {
        title: m.title,
        body: m.body,
        url: m.url,
        tag: `strekatron-${m.kind}`,
      });
      sent++;
    }
  }
  return sent;
}

/** What the minute job does; returns how many pushes went out. */
export async function runPush(now = new Date()) {
  return (await focusEnded(now)) + (await dailyReminders(now));
}
