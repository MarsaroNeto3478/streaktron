// Every query the app reads, with its key. Task lists share one key prefix (`['tasks', 'list', …]`)
// so the merge rule in tasks.ts can update all of them after a write.

import { queryOptions } from '@tanstack/react-query';
import { api, call } from './api';

const fetchMe = () => call(api.me.$get());
export type Me = Awaited<ReturnType<typeof fetchMe>>;

/** The signed-in user, their settings and their day (server-computed). */
export const meQuery = queryOptions({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000 });

/** Whether the app still needs its first account. */
export const setupQuery = queryOptions({
  queryKey: ['setup'],
  queryFn: () => call(api.setup.$get()),
});

// --- Structure -------------------------------------------------------------------------------

const fetchAreas = () => call(api.areas.$get());
export type Area = Awaited<ReturnType<typeof fetchAreas>>['areas'][number];

export const areasQuery = queryOptions({
  queryKey: ['areas'],
  queryFn: async () => (await fetchAreas()).areas,
});

const fetchProjects = () => call(api.projects.$get());
export type Project = Awaited<ReturnType<typeof fetchProjects>>['projects'][number];

/** Every project with counts and next action (sidebar, overview, pickers). */
export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: async () => (await fetchProjects()).projects,
});

const fetchProject = (id: string) => call(api.projects[':id'].$get({ param: { id } }));
export type ProjectPage = Awaited<ReturnType<typeof fetchProject>>;
export type BoardColumn = ProjectPage['columns'][number];
export type Goal = ProjectPage['goals'][number];

/** A project page: the project, its board columns and goals. */
export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ['project', id], queryFn: () => fetchProject(id) });

export interface TaskFilter {
  /** A project id, `inbox`, or every project when absent. */
  project?: string;
  status?: 'open' | 'done' | 'any';
  /** Subtasks of this task. */
  parent?: string;
}

const fetchTasks = (f: TaskFilter) =>
  call(
    api.tasks.$get({
      query: {
        ...(f.project ? { project: f.project } : {}),
        ...(f.parent ? { parent: f.parent } : {}),
        status: f.status ?? 'any',
      },
    }),
  );
export type Task = Awaited<ReturnType<typeof fetchTasks>>['tasks'][number];

/** The canonical form of a filter, so equal filters share a cache entry. */
export const normalizeFilter = (f: TaskFilter): TaskFilter => ({
  ...(f.project ? { project: f.project } : {}),
  ...(f.parent ? { parent: f.parent } : {}),
  status: f.status ?? 'any',
});

export const tasksQuery = (f: TaskFilter) => {
  const filter = normalizeFilter(f);
  return queryOptions({
    queryKey: ['tasks', 'list', filter] as const,
    queryFn: async () => (await fetchTasks(filter)).tasks,
  });
};

const fetchTask = (id: string) => call(api.tasks[':id'].$get({ param: { id } }));
export type TaskDetail = Awaited<ReturnType<typeof fetchTask>>;

export const taskQuery = (id: string) =>
  queryOptions({ queryKey: ['tasks', 'detail', id], queryFn: () => fetchTask(id) });

const fetchSnapshots = () => call(api.snapshots.$get());
export type Snapshot = Awaited<ReturnType<typeof fetchSnapshots>>['snapshots'][number];

export const snapshotsQuery = queryOptions({
  queryKey: ['snapshots'],
  queryFn: async () => (await fetchSnapshots()).snapshots,
});

const fetchSearch = (q: string, limit: number) =>
  call(api.search.$get({ query: { q, limit: String(limit) } }));
export type SearchHit = Awaited<ReturnType<typeof fetchSearch>>['results'][number];

/** Search; an empty query lists recently changed things (the mention picker's first view). */
export const searchQuery = (q: string, limit = 12) =>
  queryOptions({
    queryKey: ['search', q, limit],
    queryFn: async () => (await fetchSearch(q, limit)).results,
    staleTime: 10_000,
  });

const fetchGoal = (id: string) => call(api.goals[':id'].$get({ param: { id } }));

/** One goal (the goal sheet). */
export const goalQuery = (id: string) =>
  queryOptions({ queryKey: ['goal', id], queryFn: () => fetchGoal(id) });

// --- The day and the game --------------------------------------------------------------------

const fetchGame = () => call(api.game.state.$get());
export type GameStateView = Awaited<ReturnType<typeof fetchGame>>;

/** XP, level, streaks (server-computed from the activity log). */
export const gameStateQuery = queryOptions({ queryKey: ['game', 'state'], queryFn: fetchGame });

const fetchQuests = () => call(api.quests.$get());
export type Quest = Awaited<ReturnType<typeof fetchQuests>>['quests'][number];

/** Today's and this week's quests; fetching brings progress up to date. */
export const questsQuery = queryOptions({
  queryKey: ['game', 'quests'],
  queryFn: async () => (await fetchQuests()).quests,
});

const fetchToday = () => call(api.today.$get());
export type FocusItem = Awaited<ReturnType<typeof fetchToday>>['focus'][number];

/** Today's focus list. */
export const todayQuery = queryOptions({ queryKey: ['today'], queryFn: fetchToday });

const fetchFocus = () => call(api.focus.current.$get());
export type FocusSession = NonNullable<Awaited<ReturnType<typeof fetchFocus>>['session']>;

/** The running or paused focus session, if any. */
export const focusQuery = queryOptions({
  queryKey: ['focus'],
  queryFn: async () => (await fetchFocus()).session,
});

const fetchHeatmap = (from: string, to: string) =>
  call(api.stats.heatmap.$get({ query: { from, to } }));
export type HeatDay = Awaited<ReturnType<typeof fetchHeatmap>>['days'][number];

export const heatmapQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ['game', 'heatmap', from, to],
    queryFn: async () => (await fetchHeatmap(from, to)).days,
  });

const fetchHabits = (archived: boolean) =>
  call(api.habits.$get({ query: { archived: archived ? 'true' : 'false' } }));
export type Habit = Awaited<ReturnType<typeof fetchHabits>>['habits'][number];

/** The user's habits (or the archived ones), in their order. */
export const habitsQuery = (archived = false) =>
  queryOptions({
    queryKey: ['habits', archived],
    queryFn: async () => (await fetchHabits(archived)).habits,
  });
