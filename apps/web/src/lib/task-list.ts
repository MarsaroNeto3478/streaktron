// The list view's filters, sorts and groups, as pure functions over loaded tasks.

import { addDays, daysBetween, startOfWeek } from '@strekatron/shared/time';
import type { Project, Task } from './queries';

export const STATUS_FILTERS = ['open', 'todo', 'in_progress', 'done', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const DUE_FILTERS = ['any', 'overdue', 'today', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export const SORTS = ['board', 'due', 'created', 'title', 'effort'] as const;
export type SortKey = (typeof SORTS)[number];

export const GROUPS = ['none', 'project', 'status', 'due'] as const;
export type GroupKey = (typeof GROUPS)[number];

export interface ListOptions {
  /** A project id, `inbox`, or all. */
  project?: string;
  status: StatusFilter;
  due: DueFilter;
  sort: SortKey;
  group: GroupKey;
}

export const DEFAULT_LIST: ListOptions = {
  status: 'open',
  due: 'any',
  sort: 'due',
  group: 'project',
};

/** The day a task is due for: its due date, else the day it's scheduled. */
const dayOf = (t: Task) => t.dueDate ?? t.scheduledDate;

export function isOverdue(t: Task, today: string) {
  return t.completedAt === null && t.dueDate !== null && t.dueDate < today;
}

export function filterTasks(tasks: Task[], o: ListOptions, today: string, weekStart = 1): Task[] {
  const weekEnd = addDays(startOfWeek(today, weekStart), 6);
  return tasks.filter((t) => {
    if (o.project === 'inbox' ? t.projectId !== null : o.project && t.projectId !== o.project) {
      return false;
    }
    switch (o.status) {
      case 'open':
        if (t.status === 'done') return false;
        break;
      case 'all':
        break;
      default:
        if (t.status !== o.status) return false;
    }
    const day = dayOf(t);
    switch (o.due) {
      case 'overdue':
        return isOverdue(t, today);
      case 'today':
        // Due or scheduled today, plus anything open from before.
        return day !== null && (t.completedAt === null ? day <= today : day === today);
      case 'week':
        return day !== null && day <= weekEnd;
      case 'none':
        return day === null;
      default:
        return true;
    }
  });
}

const EFFORT_RANK = { S: 0, M: 1, L: 2 } as const;

/** Compare with nulls last. */
function nullsLast<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return cmp(a, b);
}

const text = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const board = (a: Task, b: Task) =>
    a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
    board,
    due: (a, b) => nullsLast(dayOf(a), dayOf(b), text) || board(a, b),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    title: (a, b) => text(a.title, b.title),
    effort: (a, b) =>
      nullsLast(a.effort, b.effort, (x, y) => EFFORT_RANK[y] - EFFORT_RANK[x]) || board(a, b),
  };
  // Done tasks sink below open ones, whatever the sort.
  return [...tasks].sort(
    (a, b) => Number(a.completedAt !== null) - Number(b.completedAt !== null) || cmp[sort](a, b),
  );
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' } as const;

function dueBucket(t: Task, today: string): [number, string] {
  const day = dayOf(t);
  if (t.completedAt !== null) return [6, 'Done'];
  if (day === null) return [5, 'No date'];
  const diff = daysBetween(today, day);
  if (t.dueDate !== null && t.dueDate < today) return [0, 'Overdue'];
  if (diff <= 0) return [1, 'Today'];
  if (diff === 1) return [2, 'Tomorrow'];
  if (diff < 7) return [3, 'Next 7 days'];
  return [4, 'Later'];
}

/** Groups in a sensible order; tasks keep the order they came in (already sorted). */
export function groupTasks(
  tasks: Task[],
  group: GroupKey,
  ctx: { today: string; projects: Project[] },
): TaskGroup[] {
  if (group === 'none') return [{ key: 'all', label: '', tasks }];
  const groups = new Map<string, TaskGroup & { rank: number }>();
  const projectRank = new Map(ctx.projects.map((p, i) => [p.id, i]));
  for (const t of tasks) {
    let key: string;
    let label: string;
    let rank: number;
    if (group === 'project') {
      const p = t.projectId ? ctx.projects.find((x) => x.id === t.projectId) : undefined;
      key = t.projectId ?? 'inbox';
      label = t.projectId ? (p?.title ?? 'Unknown project') : 'Inbox';
      rank = t.projectId ? (projectRank.get(t.projectId) ?? 9999) + 1 : 0;
    } else if (group === 'status') {
      key = t.status;
      label = STATUS_LABEL[t.status];
      rank = ['in_progress', 'todo', 'done'].indexOf(t.status);
    } else {
      [rank, label] = dueBucket(t, ctx.today);
      key = label;
    }
    const g = groups.get(key) ?? { key, label, tasks: [], rank };
    g.tasks.push(t);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank).map(({ rank: _, ...g }) => g);
}
