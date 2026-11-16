// Writes, with their cache updates. Task writes go through the merge rule (task-cache.ts): the
// predicted result is merged at once (optimistic), the server's answer replaces it, a failure
// refetches. Every action reports its own failure and resolves to undefined.
//
// The day-to-day ones (capture, edit, complete, move, habit check-ins) go through the outbox
// (outbox.ts, D55): when the server can't be reached they wait on this device and the predicted
// result stays on screen until they sync.
//
//   const tasks = useTaskActions();
//   await tasks.complete(task);

import type {
  AreaCreate,
  AreaPatch,
  GoalCreate,
  GoalPatch,
  EventCreate,
  EventPatch,
  HabitCreate,
  HabitPatch,
  ProjectCreate,
  ProjectPatch,
  ReviewComplete,
  SettingsPatch,
  TaskCreate,
  TaskPatch,
} from '@strekatron/shared/schemas';
import {
  firstColumnOf,
  firstOpenColumn,
  placeAt,
  type ColumnCategory,
  type ProjectStatus,
} from '@strekatron/shared/structure';
import type { Challenge } from '@strekatron/shared/game';
import { newId } from '@strekatron/shared/ids';
import { userDay } from '@strekatron/shared/time';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { api, call } from './api';
import type {
  Area,
  BoardColumn,
  FocusSession,
  Goal,
  Habit,
  Me,
  Project,
  ProjectPage,
  Task,
  TaskDetail,
  Tutorial,
} from './queries';
import { refreshEntities } from './entities';
import { send, type Change } from './outbox';
import { predictCreate, predictHabit, predictPatch } from './predict';
import { attempt, report } from './report';
import { cachedTask, dropTasks, mergeTasks, refreshAfterTaskWrite } from './task-cache';

const columnsOf = (qc: QueryClient, projectId: string | null) =>
  projectId ? qc.getQueryData<ProjectPage>(['project', projectId])?.columns : undefined;

/** What completing or reopening will look like, as far as the client can tell. */
function predictDone(qc: QueryClient, task: Task, done: boolean): Task {
  const next: Task = {
    ...task,
    completedAt: done ? new Date().toISOString() : null,
    status: done ? 'done' : 'todo',
  };
  const columns = columnsOf(qc, task.projectId);
  if (columns && !task.parentTaskId) {
    const current = columns.find((c) => c.id === task.columnId);
    const target = done
      ? current?.category === 'done'
        ? current
        : firstColumnOf(columns, 'done')
      : current && current.category !== 'done'
        ? current
        : firstOpenColumn(columns);
    if (target) {
      next.columnId = target.id;
      next.status = target.category;
      if (target.id !== task.columnId) next.sortOrder = -1e9; // top
    }
  }
  return next;
}

/**
 * Optimistic write through the outbox: merge `predicted`, send, merge the answer; on failure
 * refetch and report. Offline, the prediction stays until the change syncs.
 */
async function optimistic(
  qc: QueryClient,
  predicted: Task[],
  change: Change,
  label: string,
  projects: (string | null)[],
): Promise<Task | undefined> {
  mergeTasks(qc, ...predicted);
  try {
    const sent = await send<Task>(change, label);
    if (sent.queued) return predicted[0];
    mergeTasks(qc, sent.result);
    refreshAfterTaskWrite(qc, projects);
    return sent.result;
  } catch (err) {
    report(err);
    refreshAfterTaskWrite(qc, projects);
    return undefined;
  }
}

/** A task edit sent through the outbox; offline, the edit is predicted. Throws. */
async function patchTask(qc: QueryClient, id: string, patch: TaskPatch, fallback?: Task) {
  const sent = await send<Task>({ kind: 'task.patch', id, patch }, fallback?.title ?? 'a task');
  if (!sent.queued) return { task: sent.result, queued: false };
  const task = cachedTask(qc, id) ?? fallback;
  if (!task) return { task: undefined, queued: true };
  const predicted = predictPatch(task, patch, {
    columns: patch.projectId ? columnsOf(qc, patch.projectId) : undefined,
  });
  return { task: predicted, queued: true };
}

/** The user's day now, on this device (offline, the cached `me.today` may be from yesterday). */
function localToday(qc: QueryClient): string | undefined {
  const me = qc.getQueryData<Me>(['me']);
  if (!me) return undefined;
  try {
    return userDay(new Date(), {
      timeZone: me.settings.timezone,
      dayStartHour: me.settings.dayStartHour,
    });
  } catch {
    return me.today;
  }
}

export function taskActions(qc: QueryClient) {
  return {
    /** Made with its id here, so sending it again (from the outbox) makes it once (D55). */
    create: (input: TaskCreate) =>
      attempt(async () => {
        const withId = { ...input, id: newId('task') };
        const sent = await send<Task>({ kind: 'task.create', input: withId }, input.title);
        if (sent.queued) {
          const parent = input.parentTaskId ? cachedTask(qc, input.parentTaskId) : undefined;
          const projectId = parent ? parent.projectId : (input.projectId ?? null);
          const task = predictCreate(withId, { columns: columnsOf(qc, projectId), parent });
          mergeTasks(qc, task);
          // Its sheet opens from this until the server has it.
          qc.setQueryData<TaskDetail>(['tasks', 'detail', task.id], {
            ...task,
            description: (input.description ?? null) as TaskDetail['description'],
          });
          return task;
        }
        mergeTasks(qc, sent.result);
        refreshAfterTaskWrite(qc, [sent.result.projectId]);
        return sent.result;
      }),

    update: (task: Task, patch: TaskPatch) =>
      attempt(async () => {
        const { task: updated, queued } = await patchTask(qc, task.id, patch, task);
        if (!updated) return undefined;
        mergeTasks(qc, updated);
        if (queued) return updated;
        if (patch.projectId !== undefined || patch.goalId !== undefined) {
          refreshAfterTaskWrite(qc, [task.projectId, updated.projectId]);
        } else if (patch.dueDate !== undefined || patch.scheduledDate !== undefined) {
          // Dates decide where it shows on the calendar and Today's list.
          void qc.invalidateQueries({ queryKey: ['calendar'] });
          void qc.invalidateQueries({ queryKey: ['today'] });
        }
        return updated;
      }),

    /** Autosave's sender: throws, so the saver can retry and show its state. */
    save: async (id: string, patch: TaskPatch) => {
      const { task: updated, queued } = await patchTask(qc, id, patch, cachedTask(qc, id));
      if (updated) mergeTasks(qc, updated);
      // Task views leave the document out; the cached detail must have what was saved, or the
      // sheet opened again would start from the old text.
      if (patch.description !== undefined) {
        qc.setQueryData<TaskDetail>(['tasks', 'detail', id], (old) =>
          old
            ? { ...old, description: (patch.description ?? null) as TaskDetail['description'] }
            : old,
        );
      }
      if (!queued) refreshEntities(qc);
      return updated;
    },

    complete: (task: Task) =>
      optimistic(
        qc,
        [predictDone(qc, task, true)],
        { kind: 'task.complete', id: task.id },
        task.title,
        [task.projectId],
      ),

    reopen: (task: Task) =>
      optimistic(
        qc,
        [predictDone(qc, task, false)],
        { kind: 'task.reopen', id: task.id },
        task.title,
        [task.projectId],
      ),

    toggle(task: Task) {
      return task.completedAt ? this.reopen(task) : this.complete(task);
    },

    /**
     * Board drag and drop: into `column` at `index` among `columnTasks` (that column's tasks as
     * shown, in order, without the moved one).
     */
    move: (task: Task, column: BoardColumn, index: number, columnTasks: Task[]) => {
      const order = placeAt(
        columnTasks.filter((t) => t.id !== task.id).map((t) => t.id),
        task.id,
        index,
      );
      const done = column.category === 'done';
      const predicted = order.map((id, i) => {
        const t = id === task.id ? task : columnTasks.find((x) => x.id === id)!;
        return id === task.id
          ? {
              ...t,
              columnId: column.id,
              sortOrder: i,
              status: column.category as ColumnCategory,
              completedAt: done ? (t.completedAt ?? new Date().toISOString()) : null,
            }
          : { ...t, sortOrder: i };
      });
      return optimistic(
        qc,
        predicted,
        { kind: 'task.move', id: task.id, move: { columnId: column.id, index } },
        task.title,
        [task.projectId],
      );
    },

    /** Delete, with an Undo in the toast. */
    remove: (task: Task) =>
      attempt(async () => {
        await call(api.tasks[':id'].$delete({ param: { id: task.id } }));
        dropTasks(qc, task.id);
        refreshAfterTaskWrite(qc, [task.projectId]);
        toast(`Deleted “${task.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                const back = await call(api.tasks[':id'].restore.$post({ param: { id: task.id } }));
                mergeTasks(qc, back);
                refreshAfterTaskWrite(qc, [back.projectId]);
              }),
          },
        });
      }),

    byId: (id: string) => cachedTask(qc, id),
  };
}

export function useTaskActions() {
  const qc = useQueryClient();
  return useMemo(() => taskActions(qc), [qc]);
}

// --- Areas, projects, goals ------------------------------------------------------------------

const refreshStructure = (qc: QueryClient, projectId?: string) => {
  refreshEntities(qc);
  void qc.invalidateQueries({ queryKey: ['areas'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  if (projectId) void qc.invalidateQueries({ queryKey: ['project', projectId] });
};

export function structureActions(qc: QueryClient) {
  return {
    createArea: (input: AreaCreate) =>
      attempt(async () => {
        const area = await call(api.areas.$post({ json: input }));
        qc.setQueryData<Area[]>(['areas'], (old) => (old ? [...old, area] : old));
        refreshStructure(qc);
        return area;
      }),

    updateArea: (id: string, patch: AreaPatch) =>
      attempt(async () => {
        const area = await call(api.areas[':id'].$patch({ param: { id }, json: patch }));
        qc.setQueryData<Area[]>(['areas'], (old) => old?.map((a) => (a.id === id ? area : a)));
        refreshEntities(qc);
        return area;
      }),

    /** Autosave's sender for an area's title and description: throws. */
    saveArea: async (id: string, patch: AreaPatch) => {
      const area = await call(api.areas[':id'].$patch({ param: { id }, json: patch }));
      qc.setQueryData<Area[]>(['areas'], (old) => old?.map((a) => (a.id === id ? area : a)));
      refreshEntities(qc);
      return area;
    },

    reorderAreas: (ids: string[]) => {
      const before = qc.getQueryData<Area[]>(['areas']);
      if (before) {
        qc.setQueryData<Area[]>(
          ['areas'],
          ids.map((id) => before.find((a) => a.id === id)!).filter(Boolean),
        );
      }
      return attempt(async () => {
        try {
          const { areas } = await call(api.areas.reorder.$post({ json: { ids } }));
          qc.setQueryData(['areas'], areas);
        } catch (err) {
          void qc.invalidateQueries({ queryKey: ['areas'] });
          throw err;
        }
      });
    },

    deleteArea: (area: Area, projects: 'keep' | 'delete') =>
      attempt(async () => {
        const res = await call(
          api.areas[':id'].$delete({ param: { id: area.id }, query: { projects } }),
        );
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        undoToast(qc, `Deleted area “${area.title}”`, res.snapshotId);
        return res;
      }),

    createProject: (input: ProjectCreate) =>
      attempt(async () => {
        const project = await call(api.projects.$post({ json: input }));
        refreshStructure(qc);
        return project;
      }),

    updateProject: (id: string, patch: ProjectPatch) =>
      attempt(async () => {
        const project = await call(api.projects[':id'].$patch({ param: { id }, json: patch }));
        qc.setQueryData<Project[]>(['projects'], (old) =>
          old?.map((p) => (p.id === id ? project : p)),
        );
        qc.setQueryData<ProjectPage>(['project', id], (old) => (old ? { ...old, project } : old));
        refreshStructure(qc, id);
        return project;
      }),

    /** Autosave's sender for a project's description: throws. */
    saveProject: async (id: string, patch: ProjectPatch) => {
      const project = await call(api.projects[':id'].$patch({ param: { id }, json: patch }));
      qc.setQueryData<Project[]>(['projects'], (old) =>
        old?.map((p) => (p.id === id ? project : p)),
      );
      qc.setQueryData<ProjectPage>(['project', id], (old) => (old ? { ...old, project } : old));
      refreshEntities(qc);
      return project;
    },

    /**
     * Drag on the Projects page: into `areaId` (null: no area) at `index` among `lane` (that
     * area's projects in progress as shown, without the moved one). Optimistic.
     */
    moveProject: (project: Project, areaId: string | null, index: number, lane: Project[]) => {
      const order = placeAt(
        lane.filter((p) => p.id !== project.id).map((p) => p.id),
        project.id,
        index,
      );
      qc.setQueryData<Project[]>(['projects'], (old) =>
        old?.map((p) => {
          const i = order.indexOf(p.id);
          if (i === -1) return p;
          return { ...p, sortOrder: i, ...(p.id === project.id ? { areaId } : {}) };
        }),
      );
      return attempt(async () => {
        try {
          const { projects } = await call(
            api.projects[':id'].move.$post({
              param: { id: project.id },
              json: { areaId, index },
            }),
          );
          qc.setQueryData<Project[]>(['projects'], (old) =>
            old?.map((p) => projects.find((x) => x.id === p.id) ?? p),
          );
        } finally {
          refreshStructure(qc, project.id);
        }
      });
    },

    /** Throws (an `active_limit` 409 is handled by the caller's dialog). */
    setStatus: async (id: string, status: ProjectStatus, park?: string) => {
      const { projects } = await call(
        api.projects[':id'].status.$post({ param: { id }, json: { status, park } }),
      );
      for (const p of projects) refreshStructure(qc, p.id);
      return projects;
    },

    /** A parked project revisited and left parked (D43): it counts for the revisit quest. */
    keepParked: (project: Pick<Project, 'id' | 'title'>) =>
      attempt(async () => {
        const updated = await call(
          api.projects[':id']['keep-parked'].$post({ param: { id: project.id } }),
        );
        refreshStructure(qc, project.id);
        toast.success(`“${project.title}” stays parked`);
        return updated;
      }),

    deleteProject: (project: Project) =>
      attempt(async () => {
        const res = await call(api.projects[':id'].$delete({ param: { id: project.id } }));
        qc.removeQueries({ queryKey: ['project', project.id] });
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        undoToast(qc, `Deleted “${project.title}”`, res.snapshotId);
        return res;
      }),

    createColumn: (projectId: string, title: string, category: ColumnCategory) =>
      attempt(async () => {
        await call(
          api.projects[':id'].columns.$post({
            param: { id: projectId },
            json: { title, category },
          }),
        );
        refreshStructure(qc, projectId);
      }),

    updateColumn: (column: BoardColumn, patch: { title?: string; category?: ColumnCategory }) =>
      attempt(async () => {
        await call(api.columns[':id'].$patch({ param: { id: column.id }, json: patch }));
        refreshStructure(qc, column.projectId);
        if (patch.category) void qc.invalidateQueries({ queryKey: ['tasks'] });
      }),

    reorderColumns: (projectId: string, ids: string[]) =>
      attempt(async () => {
        const page = qc.getQueryData<ProjectPage>(['project', projectId]);
        if (page) {
          qc.setQueryData<ProjectPage>(['project', projectId], {
            ...page,
            columns: ids.map((id) => page.columns.find((c) => c.id === id)!),
          });
        }
        try {
          await call(
            api.projects[':id'].columns.reorder.$post({ param: { id: projectId }, json: { ids } }),
          );
        } finally {
          refreshStructure(qc, projectId);
        }
      }),

    deleteColumn: (column: BoardColumn) =>
      attempt(async () => {
        await call(api.columns[':id'].$delete({ param: { id: column.id }, query: {} }));
        refreshStructure(qc, column.projectId);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
      }),

    createGoal: (input: GoalCreate) =>
      attempt(async () => {
        const goal = await call(api.goals.$post({ json: input }));
        refreshStructure(qc, input.projectId);
        return goal;
      }),

    updateGoal: (goal: Goal, patch: GoalPatch) =>
      attempt(async () => {
        const updated = await call(
          api.goals[':id'].$patch({ param: { id: goal.id }, json: patch }),
        );
        qc.setQueryData<ProjectPage>(['project', goal.projectId], (old) =>
          old ? { ...old, goals: old.goals.map((g) => (g.id === goal.id ? updated : g)) } : old,
        );
        qc.setQueryData(['goal', goal.id], updated);
        refreshEntities(qc);
        return updated;
      }),

    /** Autosave's sender for a goal's title and description: throws. */
    saveGoal: async (goal: Goal, patch: GoalPatch) => {
      const updated = await call(api.goals[':id'].$patch({ param: { id: goal.id }, json: patch }));
      qc.setQueryData<ProjectPage>(['project', goal.projectId], (old) =>
        old ? { ...old, goals: old.goals.map((g) => (g.id === goal.id ? updated : g)) } : old,
      );
      qc.setQueryData(['goal', goal.id], updated);
      refreshEntities(qc);
      return updated;
    },

    deleteGoal: (goal: Goal) =>
      attempt(async () => {
        await call(api.goals[':id'].$delete({ param: { id: goal.id } }));
        refreshStructure(qc, goal.projectId);
        toast(`Deleted goal “${goal.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                await call(api.goals[':id'].restore.$post({ param: { id: goal.id } }));
                refreshStructure(qc, goal.projectId);
              }),
          },
        });
      }),

    restoreSnapshot: (id: string) =>
      attempt(async () => {
        const res = await call(api.snapshots[':id'].restore.$post({ param: { id } }));
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        toast.success(`Restored “${res.title}”`, {
          description: res.parked.length
            ? `Your active limit is full, so it came back parked.`
            : undefined,
        });
        return res;
      }),

    updateSettings: (activeProjectLimit: number) =>
      attempt(async () => {
        await call(api.settings.$patch({ json: { activeProjectLimit } }));
        void qc.invalidateQueries({ queryKey: ['me'] });
      }),
  };
}

function undoToast(qc: QueryClient, message: string, snapshotId: string) {
  toast(message, {
    description: 'You can restore it from Settings for 30 days.',
    action: {
      label: 'Undo',
      onClick: () => void structureActions(qc).restoreSnapshot(snapshotId),
    },
  });
}

export function useStructureActions() {
  const qc = useQueryClient();
  return useMemo(() => structureActions(qc), [qc]);
}

// --- Focus sessions, quests, settings --------------------------------------------------------

export function gameActions(qc: QueryClient) {
  const setSession = (s: FocusSession | null) => qc.setQueryData(['focus'], s);
  return {
    startFocus: (input: { plannedMinutes: number; taskId?: string; projectId?: string }) =>
      attempt(async () => {
        const s = await call(api.focus.start.$post({ json: input }));
        setSession(s);
        return s;
      }),

    pauseFocus: (id: string) =>
      attempt(async () => setSession(await call(api.focus[':id'].pause.$post({ param: { id } })))),

    resumeFocus: (id: string) =>
      attempt(async () => setSession(await call(api.focus[':id'].resume.$post({ param: { id } })))),

    /** Finish: the minutes worked count (XP, quests); optionally completes the attached task. */
    finishFocus: (id: string, input: { note?: string; completeTask?: boolean }) =>
      attempt(async () => {
        const res = await call(api.focus[':id'].finish.$post({ param: { id }, json: input }));
        setSession(null);
        if (res.task) {
          mergeTasks(qc, res.task);
          refreshAfterTaskWrite(qc, [res.task.projectId]);
        }
        // Commitment goals count focus minutes (D40).
        void qc.invalidateQueries({ queryKey: ['project'] });
        void qc.invalidateQueries({ queryKey: ['goal'] });
        return res;
      }),

    abandonFocus: (id: string) =>
      attempt(async () => {
        await call(api.focus[':id'].abandon.$post({ param: { id } }));
        setSession(null);
      }),

    reroll: (id: string) =>
      attempt(async () => {
        const next = await call(api.quests[':id'].reroll.$post({ param: { id } }));
        await qc.invalidateQueries({ queryKey: ['game', 'quests'] });
        return next;
      }),

    /** Open one loot box, or every unopened one (D48); resolves to what came out. */
    openBoxes: (which: { id: string } | 'all') =>
      attempt(async () => {
        const res =
          which === 'all'
            ? await call(api.loot['open-all'].$post())
            : await call(api.loot[':id'].open.$post({ param: { id: which.id } }));
        void qc.invalidateQueries({ queryKey: ['game', 'loot'] });
        void qc.invalidateQueries({ queryKey: ['game', 'collection'] });
        return res.opened;
      }),

    /** Throws (the settings form shows the message, e.g. the weekly time-zone lock). */
    saveSettings: async (patch: SettingsPatch) => {
      const settings = await call(api.settings.$patch({ json: patch }));
      await qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['game'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      return settings;
    },
  };
}

export function useGameActions() {
  const qc = useQueryClient();
  return useMemo(() => gameActions(qc), [qc]);
}

// --- Streaky's tour (D31, D32) ---------------------------------------------------------------

export function tutorialActions(qc: QueryClient) {
  const settle = (t: Tutorial) => {
    qc.setQueryData(['tutorial'], t);
    void qc.invalidateQueries({ queryKey: ['game', 'quests'] });
    return t;
  };
  return {
    start: () => attempt(async () => settle(await call(api.tutorial.start.$post()))),
    /** null: skip the question. */
    answer: (challenge: Challenge | null) =>
      attempt(async () => {
        const res = await call(api.tutorial.challenge.$post({ json: { challenge } }));
        // The answer tunes Today, the quests and maybe the active limit (D36).
        void qc.invalidateQueries({ queryKey: ['me'] });
        void qc.invalidateQueries({ queryKey: ['today'] });
        return settle(res);
      }),
    skip: () => attempt(async () => settle(await call(api.tutorial.skip.$post()))),
    close: () => attempt(async () => settle(await call(api.tutorial.close.$post()))),
  };
}

export function useTutorialActions() {
  const qc = useQueryClient();
  return useMemo(() => tutorialActions(qc), [qc]);
}

// --- The weekly review (D38) -----------------------------------------------------------------

export function reviewActions(qc: QueryClient) {
  return {
    complete: (answers: ReviewComplete) =>
      attempt(async () => {
        const res = await call(api.reviews.complete.$post({ json: answers }));
        void qc.invalidateQueries({ queryKey: ['review'] });
        void qc.invalidateQueries({ queryKey: ['game'] });
        void qc.invalidateQueries({ queryKey: ['today'] });
        return res;
      }),
  };
}

export function useReviewActions() {
  const qc = useQueryClient();
  return useMemo(() => reviewActions(qc), [qc]);
}

// --- Habits ----------------------------------------------------------------------------------

export function habitActions(qc: QueryClient) {
  /** Put a fresh view of a habit wherever it's cached; Today re-reads its list (unless offline). */
  const put = (h: Habit, refetch = true) => {
    for (const archived of [false, true]) {
      qc.setQueryData<Habit[]>(['habits', archived], (list) =>
        list?.map((x) => (x.id === h.id ? h : x)),
      );
    }
    qc.setQueryData<{ habits: Habit[] }>(['today'], (old) =>
      old ? { ...old, habits: old.habits.map((x) => (x.id === h.id ? h : x)) } : old,
    );
    if (refetch) void qc.invalidateQueries({ queryKey: ['today'] });
  };
  const cachedHabit = (id: string) =>
    qc.getQueryData<Habit[]>(['habits', false])?.find((h) => h.id === id) ??
    qc.getQueryData<{ habits: Habit[] }>(['today'])?.habits.find((h) => h.id === id);

  /** Check in or uncheck through the outbox; offline, the habit shows it at once. */
  async function checkTo(id: string, checked: boolean, date: string | undefined, change: Change) {
    const habit = cachedHabit(id);
    const sent = await send<Habit>(change, habit?.title ?? 'a habit');
    if (!sent.queued) {
      put(sent.result);
      return sent.result;
    }
    const today = localToday(qc);
    if (!habit || !today) return habit;
    const predicted = predictHabit(habit, date ?? today, checked, today);
    put(predicted, false);
    return predicted;
  }
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['habits'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['game', 'quests'] });
  };
  return {
    create: (input: HabitCreate) =>
      attempt(async () => {
        const h = await call(api.habits.$post({ json: input }));
        refresh();
        toast.success(`Added habit “${h.title}”`);
        return h;
      }),

    update: (id: string, patch: HabitPatch) =>
      attempt(async () => {
        const h = await call(api.habits[':id'].$patch({ param: { id }, json: patch }));
        if (patch.archived !== undefined || patch.schedule) refresh();
        else put(h);
        return h;
      }),

    archive: (h: Habit, archived: boolean) =>
      attempt(async () => {
        await call(api.habits[':id'].$patch({ param: { id: h.id }, json: { archived } }));
        refresh();
        toast(archived ? `Archived “${h.title}”` : `Brought back “${h.title}”`);
      }),

    remove: (h: Habit) =>
      attempt(async () => {
        await call(api.habits[':id'].$delete({ param: { id: h.id } }));
        refresh();
        toast(`Deleted habit “${h.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                await call(api.habits[':id'].restore.$post({ param: { id: h.id } }));
                refresh();
              }),
          },
        });
      }),

    /** Check in for today, or `date` (yesterday, when forgotten). Works offline (D55). */
    checkIn: (id: string, date?: string) =>
      attempt(() => checkTo(id, true, date, { kind: 'habit.checkin', id, date })),

    /** Works offline (D55). */
    uncheck: (id: string, date: string) =>
      attempt(() => checkTo(id, false, date, { kind: 'habit.uncheck', id, date })),
  };
}

export function useHabitActions() {
  const qc = useQueryClient();
  return useMemo(() => habitActions(qc), [qc]);
}

// --- Calendar events -------------------------------------------------------------------------

export function eventActions(qc: QueryClient) {
  const refresh = (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    if (id) void qc.invalidateQueries({ queryKey: ['event', id] });
  };
  return {
    create: (input: EventCreate) =>
      attempt(async () => {
        const e = await call(api.events.$post({ json: input }));
        refresh();
        toast.success(`Added “${e.title}”`);
        return e;
      }),

    update: (id: string, patch: EventPatch) =>
      attempt(async () => {
        const e = await call(api.events[':id'].$patch({ param: { id }, json: patch }));
        refresh(id);
        return e;
      }),

    /** Remove one occurrence of a repeating event. */
    skip: (id: string, title: string, date: string) =>
      attempt(async () => {
        await call(api.events[':id'].skip.$post({ param: { id }, json: { date } }));
        refresh(id);
        toast(`Removed “${title}” on ${date}`);
      }),

    remove: (id: string, title: string) =>
      attempt(async () => {
        await call(api.events[':id'].$delete({ param: { id } }));
        refresh(id);
        toast(`Deleted “${title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                await call(api.events[':id'].restore.$post({ param: { id } }));
                refresh(id);
              }),
          },
        });
      }),
  };
}

export function useEventActions() {
  const qc = useQueryClient();
  return useMemo(() => eventActions(qc), [qc]);
}

// --- Your data (D51) -------------------------------------------------------------------------

export type ExportFile = Awaited<ReturnType<typeof fetchExport>>;
const fetchExport = () => call(api.data.export.$get());

export function dataActions(qc: QueryClient) {
  return {
    /** Everything the account has, saved as a JSON file. */
    exportData: () =>
      attempt(async () => {
        const file = await fetchExport();
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `strekatron-export-${file.exportedAt.slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return file;
      }),

    /** Replace the account's data with an export's; every view reloads. */
    importData: (file: ExportFile) =>
      attempt(async () => {
        const res = await call(api.data.import.$post({ json: file }));
        await qc.invalidateQueries();
        return res;
      }),
  };
}

export function useDataActions() {
  const qc = useQueryClient();
  return useMemo(() => dataActions(qc), [qc]);
}
