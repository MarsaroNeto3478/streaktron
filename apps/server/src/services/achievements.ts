// Medals and prizes (D49). What's reached is derived from the activity log (and, for finished
// projects, from the projects); this stores each one the first time and never takes it back.
// Medals reached before this existed arrive the first time it runs, with their real day.

import {
  ACHIEVEMENT_UNITS,
  ACHIEVEMENTS,
  achievementStatus,
  projectPrizeKey,
  type Activity,
  type EarnedAchievement,
} from '@strekatron/shared/game';
import { newId } from '@strekatron/shared/ids';
import type { DateString } from '@strekatron/shared/time';
import { and, asc, eq } from 'drizzle-orm';
import { achievements, projects, userSettings } from '../db/schema';
import { dayOf } from './activity';
import type { Conn, Tx } from './common';

type SettingsRow = typeof userSettings.$inferSelect;

export type Earned = EarnedAchievement;

const DEFS = new Map(ACHIEVEMENTS.map((d) => [d.key, d]));

/** Store the medals and prizes reached and not stored yet; returns the new ones. */
export async function grantAchievements(
  tx: Tx,
  userId: string,
  acts: readonly Activity[],
  s: SettingsRow,
  today: DateString,
): Promise<Earned[]> {
  const have = new Set(
    (
      await tx
        .select({ key: achievements.key })
        .from(achievements)
        .where(eq(achievements.userId, userId))
    ).map((r) => r.key),
  );

  const due: {
    key: string;
    kind: 'medal' | 'prize';
    earnedOn: DateString;
    title: string;
    params?: Record<string, unknown>;
  }[] = [];
  for (const st of achievementStatus(acts, {
    today,
    weekStart: s.weekStart,
    weeklyActiveDayTarget: s.weeklyActiveDayTarget,
  })) {
    if (!st.reachedOn || have.has(st.key)) continue;
    const d = DEFS.get(st.key)!;
    due.push({ key: d.key, kind: d.kind, earnedOn: st.reachedOn, title: d.title });
  }
  const finished = await tx
    .select({ id: projects.id, title: projects.title, at: projects.statusChangedAt })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'completed')));
  for (const p of finished) {
    const key = projectPrizeKey(p.id);
    if (have.has(key)) continue;
    due.push({
      key,
      kind: 'prize',
      earnedOn: dayOf(s, p.at),
      title: `Finished “${p.title}”`,
      params: { projectId: p.id, title: p.title },
    });
  }

  const earned: Earned[] = [];
  for (const a of due) {
    const added = await tx
      .insert(achievements)
      .values({
        id: newId('achievement'),
        userId,
        key: a.key,
        kind: a.kind,
        earnedOn: a.earnedOn,
        params: a.params ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: achievements.id });
    if (added.length) earned.push({ key: a.key, kind: a.kind, title: a.title });
  }
  return earned;
}

/** Every medal and milestone prize with its progress, and the prizes for finished projects. */
export async function achievementsView(
  conn: Conn,
  userId: string,
  acts: readonly Activity[],
  s: SettingsRow,
  today: DateString,
) {
  const rows = await conn
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(asc(achievements.earnedOn), asc(achievements.key));
  const stored = new Map(rows.map((r) => [r.key, r]));
  const status = new Map(
    achievementStatus(acts, {
      today,
      weekStart: s.weekStart,
      weeklyActiveDayTarget: s.weeklyActiveDayTarget,
    }).map((st) => [st.key, st]),
  );
  return {
    achievements: ACHIEVEMENTS.map((d) => ({
      ...d,
      unit: ACHIEVEMENT_UNITS[d.group],
      value: status.get(d.key)?.value ?? 0,
      earnedOn: stored.get(d.key)?.earnedOn ?? null,
    })),
    projectPrizes: rows
      .filter((r) => r.key.startsWith('project.'))
      .map((r) => ({
        key: r.key,
        title: String(r.params.title ?? 'A project'),
        projectId: String(r.params.projectId ?? ''),
        earnedOn: r.earnedOn,
      })),
  };
}
