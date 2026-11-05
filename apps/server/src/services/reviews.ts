// The weekly review (D38): what the last seven days held, which active projects stalled, and the
// review itself (once per week). Doing it logs `review_completed`: 50 XP once per week, an active
// day, and the "Do the weekly review" quest.

import {
  inReviewWindow,
  qualifies,
  reviewRange,
  reviewWeek,
  xpCredits,
  type Activity,
} from '@streaktron/shared/game';
import { newId } from '@streaktron/shared/ids';
import type { ReviewComplete } from '@streaktron/shared/schemas';
import type { DateString } from '@streaktron/shared/time';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { projects, userSettings, weeklyReviews, type ReviewSummary } from '../db/schema';
import { dayOf, recordActivity } from './activity';
import { conflict, notFound, type Conn } from './common';
import { loadActivities } from './game';

async function settingsOf(conn: Conn, userId: string) {
  const [s] = await conn.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!s) throw notFound('user');
  return s;
}

/** The numbers of `from`…`to`, from the activity log. */
function summarize(all: readonly Activity[], from: DateString, to: DateString): ReviewSummary {
  const credits = xpCredits(all); // earn-once and caps need the whole log
  const acts = all.filter((a) => a.localDate >= from && a.localDate <= to);
  const tasks = new Set<string>();
  const days = new Set<DateString>();
  let focusMinutes = 0;
  let habitCheckins = 0;
  let xp = 0;
  for (const a of acts) {
    if (a.type === 'task_completed' && !a.payload.subtask && a.entityId) tasks.add(a.entityId);
    if (a.type === 'focus_completed') focusMinutes += a.payload.minutes;
    if (a.type === 'habit_checked') habitCheckins++;
    if (qualifies(a)) days.add(a.localDate);
    xp += credits.get(a.id) ?? 0;
  }
  return {
    from,
    to,
    tasksDone: tasks.size,
    focusMinutes,
    activeDays: days.size,
    habitCheckins,
    xp,
  };
}

/** This week's review: whether it's due or done, the last seven days, and what stalled. */
export async function currentReview(userId: string) {
  const s = await settingsOf(db, userId);
  const today = dayOf(s);
  const week = reviewWeek(today, s.weekStart);
  const { from, to } = reviewRange(today);
  const acts = await loadActivities(db, userId);

  // Per active project: what moved in it these seven days.
  const active = await db
    .select({ id: projects.id, title: projects.title, color: projects.color, icon: projects.icon })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
  const moved = new Map<string, { tasks: number; focusMinutes: number }>();
  const lastWorked = new Map<string, DateString>();
  for (const a of acts) {
    if (a.type !== 'task_completed' && a.type !== 'focus_completed') continue;
    const p = a.payload.projectId;
    if (!p) continue;
    if ((lastWorked.get(p) ?? '') < a.localDate) lastWorked.set(p, a.localDate);
    if (a.localDate < from || a.localDate > to) continue;
    const m = moved.get(p) ?? { tasks: 0, focusMinutes: 0 };
    if (a.type === 'task_completed' && !a.payload.subtask) m.tasks++;
    if (a.type === 'focus_completed') m.focusMinutes += a.payload.minutes;
    moved.set(p, m);
  }
  const projectsWeek = active.map((p) => ({
    ...p,
    tasks: moved.get(p.id)?.tasks ?? 0,
    focusMinutes: moved.get(p.id)?.focusMinutes ?? 0,
    lastWorked: lastWorked.get(p.id) ?? null,
  }));

  const [done] = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, week)));

  return {
    today,
    week,
    /** Today reminds about it now (the end of the week, or the next one's first day). */
    window: inReviewWindow(today, s.weekStart),
    summary: summarize(acts, from, to),
    projects: projectsWeek,
    stalled: projectsWeek.filter((p) => p.tasks === 0 && p.focusMinutes === 0),
    done: done ? reviewView(done) : null,
  };
}

const reviewView = (r: typeof weeklyReviews.$inferSelect) => ({
  id: r.id,
  weekStart: r.weekStart,
  wentWell: r.wentWell,
  change: r.change,
  summary: r.summary,
  completedAt: r.completedAt,
});

/** Past reviews, newest first. */
export async function listReviews(userId: string) {
  const rows = await db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(52);
  return rows.map(reviewView);
}

/** Do this week's review (once). */
export async function completeReview(userId: string, input: ReviewComplete) {
  const s = await settingsOf(db, userId);
  const today = dayOf(s);
  const week = reviewWeek(today, s.weekStart);
  const { from, to } = reviewRange(today);
  const summary = summarize(await loadActivities(db, userId), from, to);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(weeklyReviews)
      .values({
        id: newId('weeklyReview'),
        userId,
        weekStart: week,
        wentWell: input.wentWell,
        change: input.change,
        summary,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('review_done', 'This week’s review is already done.');
    await recordActivity(tx, userId, {
      type: 'review_completed',
      entityId: row.id,
      payload: { weekStart: week },
    });
    return reviewView(row);
  });
}
