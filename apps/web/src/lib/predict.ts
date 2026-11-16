// What a change made offline will look like once the server has it (D55), so the screen shows it
// at once. The server's answer replaces these when the change syncs. Pure, so they're tested on
// their own.

import { textFromDoc, type RichDoc } from '@strekatron/shared/rich';
import type { TaskCreate, TaskPatch } from '@strekatron/shared/schemas';
import { addDays, type DateString } from '@strekatron/shared/time';
import { firstColumnOf, firstOpenColumn } from '@strekatron/shared/structure';
import type { BoardColumn, Habit, Task } from './queries';

/** A task just made on this device: where the server would put it, as far as we know. */
export function predictCreate(
  input: TaskCreate & { id: string },
  context: { columns?: BoardColumn[]; parent?: Task; now?: Date },
): Task {
  const now = (context.now ?? new Date()).toISOString();
  const projectId = context.parent ? context.parent.projectId : (input.projectId ?? null);
  const column =
    projectId && !input.parentTaskId && context.columns
      ? input.columnId
        ? context.columns.find((c) => c.id === input.columnId)
        : firstOpenColumn(context.columns)
      : undefined;
  const done = column?.category === 'done';
  return {
    id: input.id,
    projectId,
    goalId: input.goalId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    columnId: column?.id ?? null,
    title: input.title,
    descriptionText: input.description ? textFromDoc(input.description as RichDoc) : '',
    effort: input.effort ?? null,
    dueDate: input.dueDate ?? null,
    scheduledDate: input.scheduledDate ?? null,
    // Its end of the list: the server's order replaces this.
    sortOrder: input.position === 'top' ? -1e9 : 1e9,
    completedAt: done ? now : null,
    createdAt: now,
    updatedAt: now,
    status: done ? 'done' : (column?.category ?? 'todo'),
    subtasks: { total: 0, done: 0 },
  };
}

/** A task with an edit applied (moving to another project lands it on that board's first open column). */
export function predictPatch(
  task: Task,
  patch: TaskPatch,
  context: { columns?: BoardColumn[]; now?: Date } = {},
): Task {
  const { description, ...fields } = patch;
  const next: Task = {
    ...task,
    ...fields,
    updatedAt: (context.now ?? new Date()).toISOString(),
  } as Task;
  if (description !== undefined) next.descriptionText = textFromDoc(description as RichDoc | null);
  if (patch.projectId !== undefined && patch.projectId !== task.projectId) {
    const column =
      patch.projectId && context.columns
        ? task.completedAt
          ? firstColumnOf(context.columns, 'done')
          : firstOpenColumn(context.columns)
        : undefined;
    next.columnId = column?.id ?? null;
    next.sortOrder = -1e9;
    if (patch.goalId === undefined) next.goalId = null;
  }
  return next;
}

/** A habit checked in (or unchecked) for `day`, as of `today`. The streak is the server's to count; a day streak moves by one for today. */
export function predictHabit(
  habit: Habit,
  day: DateString,
  checked: boolean,
  today: DateString,
): Habit {
  const was =
    day === today
      ? habit.checkedToday
      : day === addDays(today, -1)
        ? habit.checkedYesterday
        : habit.recent.find((d) => d.day === day)?.checked;
  if (was === checked) return habit;
  const step = checked ? 1 : -1;
  const streak =
    day === today && habit.streak.unit === 'day'
      ? {
          ...habit.streak,
          current: Math.max(0, habit.streak.current + step),
          longest: Math.max(habit.streak.longest, habit.streak.current + step),
        }
      : habit.streak;
  return {
    ...habit,
    checkedToday: day === today ? checked : habit.checkedToday,
    checkedYesterday: day === addDays(today, -1) ? checked : habit.checkedYesterday,
    // Per-week habits count this week's check-ins; today and yesterday are close enough to this week.
    thisWeek:
      habit.schedule.type === 'per_week' ? Math.max(0, habit.thisWeek + step) : habit.thisWeek,
    streak,
    recent: habit.recent.map((d) => (d.day === day ? { ...d, checked } : d)),
  };
}
