// Today's focus list (plan.md §4.3): overdue tasks, then tasks due or scheduled today, then the next
// action of each active project. Habits join it in Phase 4. Tasks of parked, completed or archived
// projects stay out: putting a project away also quiets it here.

import type { DateString } from '@streaktron/shared/time';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { tasks } from '../db/schema';
import type { Conn } from './common';
import { projectViews } from './projects';
import { selectViews, type TaskView } from './tasks';

export type FocusReason = 'overdue' | 'due' | 'scheduled' | 'next';

export interface FocusItem {
  reason: FocusReason;
  task: TaskView;
  project: { id: string; title: string; color: string; icon: string } | null;
}

/** Open tasks in the inbox or an active project. */
const inPlay = sql`(${tasks.projectId} is null or exists (select 1 from projects p where p.id = ${tasks.projectId} and p.status = 'active'))`;

export async function focusList(
  conn: Conn,
  userId: string,
  today: DateString,
): Promise<FocusItem[]> {
  const dated = await selectViews(
    conn,
    and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.completedAt),
      isNull(tasks.parentTaskId),
      or(lte(tasks.dueDate, today), eq(tasks.scheduledDate, today)),
      inPlay,
    ),
  );
  const active = (await projectViews(conn, userId)).filter((p) => p.status === 'active');
  const projectOf = new Map(active.map((p) => [p.id, p]));

  const reasonOf = (t: TaskView): FocusReason =>
    t.dueDate && t.dueDate < today ? 'overdue' : t.dueDate === today ? 'due' : 'scheduled';
  const rank: Record<FocusReason, number> = { overdue: 0, due: 1, scheduled: 2, next: 3 };

  const items: FocusItem[] = dated
    .map((task) => ({ reason: reasonOf(task), task, project: null }))
    .sort(
      (a, b) =>
        rank[a.reason] - rank[b.reason] ||
        (a.task.dueDate ?? '').localeCompare(b.task.dueDate ?? '') ||
        a.task.title.localeCompare(b.task.title),
    );

  const seen = new Set(items.map((i) => i.task.id));
  const nextIds = active
    .map((p) => p.nextAction?.id)
    .filter((id): id is string => !!id && !seen.has(id));
  if (nextIds.length) {
    const next = await selectViews(
      conn,
      and(eq(tasks.userId, userId), sql`${tasks.id} in ${nextIds}`),
    );
    // In the order the projects are listed.
    for (const id of nextIds) {
      const task = next.find((t) => t.id === id);
      if (task) items.push({ reason: 'next', task, project: null });
    }
  }

  for (const item of items) {
    const p = item.task.projectId ? projectOf.get(item.task.projectId) : undefined;
    item.project = p ? { id: p.id, title: p.title, color: p.color, icon: p.icon } : null;
  }
  return items;
}
