// The one merge rule for tasks (plan.md §6): whatever a write returns, or what we expect it to
// return (optimistic updates), goes into every cached task list whose filter it matches, and out
// of the ones it no longer matches. Lists stay in server order (sort order, then creation).

import type { QueryClient } from '@tanstack/react-query';
import type { Task, TaskDetail, TaskFilter } from './queries';
import { refreshEntities } from './entities';

/** Whether a task belongs in a list with this filter (the server's rule, mirrored). */
export function matchesFilter(f: TaskFilter, t: Task): boolean {
  if (f.parent ? t.parentTaskId !== f.parent : t.parentTaskId !== null) return false;
  if (f.project === 'inbox' ? t.projectId !== null : f.project && t.projectId !== f.project) {
    return false;
  }
  if (f.status === 'open' && t.completedAt !== null) return false;
  if (f.status === 'done' && t.completedAt === null) return false;
  return true;
}

const byServerOrder = (a: Task, b: Task) =>
  a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

/** A list with `task` put in (replacing its old copy), or taken out when it no longer matches. */
export function applyToList(list: Task[], f: TaskFilter, task: Task): Task[] {
  const rest = list.filter((t) => t.id !== task.id);
  if (!matchesFilter(f, task)) return rest.length === list.length ? list : rest;
  return [...rest, task].sort(byServerOrder);
}

type ListKey = readonly ['tasks', 'list', TaskFilter];

function eachList(qc: QueryClient, fn: (key: ListKey, list: Task[]) => Task[]) {
  for (const [key, list] of qc.getQueriesData<Task[]>({ queryKey: ['tasks', 'list'] })) {
    if (list) qc.setQueryData(key, fn(key as unknown as ListKey, list));
  }
}

/** Put tasks (from a response, or predicted) into every cached list and their detail entries. */
export function mergeTasks(qc: QueryClient, ...tasks: Task[]) {
  eachList(qc, ([, , f], list) => tasks.reduce((l, t) => applyToList(l, f, t), list));
  for (const t of tasks) {
    qc.setQueryData<TaskDetail>(['tasks', 'detail', t.id], (old) => (old ? { ...old, ...t } : old));
  }
}

/** Take tasks out of every cached list (deleted). Subtask lists of a deleted parent go too. */
export function dropTasks(qc: QueryClient, ...ids: string[]) {
  const gone = new Set(ids);
  eachList(qc, (_, list) => {
    const kept = list.filter((t) => !gone.has(t.id));
    return kept.length === list.length ? list : kept;
  });
  for (const id of ids) {
    qc.removeQueries({ queryKey: ['tasks', 'detail', id] });
    qc.removeQueries({ queryKey: ['tasks', 'list', { parent: id, status: 'any' }] });
  }
}

/** A cached copy of a task, from any list or its detail entry. */
export function cachedTask(qc: QueryClient, id: string): Task | undefined {
  const detail = qc.getQueryData<TaskDetail>(['tasks', 'detail', id]);
  if (detail) return detail;
  for (const [, list] of qc.getQueriesData<Task[]>({ queryKey: ['tasks', 'list'] })) {
    const hit = list?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * After task writes settle: refetch what the server derives (counts, next actions, subtask
 * totals, positions of other tasks, mention chips and backlinks).
 */
export function refreshAfterTaskWrite(qc: QueryClient, projectIds: (string | null | undefined)[]) {
  refreshEntities(qc);
  void qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  void qc.invalidateQueries({ queryKey: ['today'] });
  void qc.invalidateQueries({ queryKey: ['calendar'] });
  for (const id of new Set(projectIds)) {
    if (id) void qc.invalidateQueries({ queryKey: ['project', id] });
  }
}
