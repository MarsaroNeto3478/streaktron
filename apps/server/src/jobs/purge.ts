// Deleted things past their 30 days to restore: soft-deleted tasks, goals, habits and events, expired snapshots;
// then the links whose source is gone.

import { lt } from 'drizzle-orm';
import { db } from '../db/client';
import { calendarEvents, goals, habits, tasks } from '../db/schema';
import { RESTORE_DAYS } from '../services/common';
import { purgeOrphanLinks } from '../services/links';
import { purgeExpiredSnapshots } from '../services/snapshots';

export async function runPurge(now = new Date()) {
  const cutoff = new Date(now.getTime() - RESTORE_DAYS * 86_400_000);
  const goneTasks = await db
    .delete(tasks)
    .where(lt(tasks.deletedAt, cutoff))
    .returning({ id: tasks.id });
  const goneGoals = await db
    .delete(goals)
    .where(lt(goals.deletedAt, cutoff))
    .returning({ id: goals.id });
  const goneHabits = await db
    .delete(habits)
    .where(lt(habits.deletedAt, cutoff))
    .returning({ id: habits.id });
  const goneEvents = await db
    .delete(calendarEvents)
    .where(lt(calendarEvents.deletedAt, cutoff))
    .returning({ id: calendarEvents.id });
  const snapshots = await purgeExpiredSnapshots();
  const links = await purgeOrphanLinks();
  return {
    tasks: goneTasks.length,
    goals: goneGoals.length,
    habits: goneHabits.length,
    events: goneEvents.length,
    snapshots,
    links,
  };
}
