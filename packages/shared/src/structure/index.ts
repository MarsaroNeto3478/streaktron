// Areas, projects, goals, tasks and boards: the fixed vocabularies and the pure rules the server
// enforces and the web app mirrors (for optimistic updates).

// --- Vocabularies ----------------------------------------------------------------------------

export const PROJECT_STATUSES = ['active', 'parked', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A board column maps to one of these, so the rest of the app knows what "done" means. */
export const COLUMN_CATEGORIES = ['todo', 'in_progress', 'done'] as const;
export type ColumnCategory = (typeof COLUMN_CATEGORIES)[number];

/** A task's status: its column's category, or todo/done for inbox tasks and subtasks. */
export type TaskStatus = ColumnCategory;

export const GOAL_KINDS = ['outcome', 'commitment'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_STATUSES = ['open', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_PERIODS = ['week', 'month'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const EFFORTS = ['S', 'M', 'L'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Color keys for areas and projects; the web app maps each to its swatch. */
export const COLORS = [
  'stone',
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'pink',
] as const;
export type ColorKey = (typeof COLORS)[number];

/** Icon keys for areas and projects; the web app maps each to a lucide icon. */
export const ICONS = [
  'folder',
  'book-open',
  'graduation-cap',
  'flask',
  'calculator',
  'brain',
  'languages',
  'code',
  'laptop',
  'rocket',
  'wrench',
  'briefcase',
  'lightbulb',
  'pen',
  'palette',
  'music',
  'camera',
  'gamepad',
  'dumbbell',
  'heart',
  'leaf',
  'home',
  'coffee',
  'plane',
  'globe',
  'target',
  'star',
  'trophy',
] as const;
export type IconKey = (typeof ICONS)[number];

/** Columns a new project's board starts with. */
export const DEFAULT_COLUMNS: { title: string; category: ColumnCategory }[] = [
  { title: 'To do', category: 'todo' },
  { title: 'Doing', category: 'in_progress' },
  { title: 'Done', category: 'done' },
];

// --- Project lifecycle (D5) ------------------------------------------------------------------

/** Where a project can go from each status. Activating is also subject to the active limit. */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  active: ['parked', 'completed', 'archived'],
  parked: ['active', 'completed', 'archived'],
  completed: ['active', 'parked', 'archived'],
  archived: ['parked'],
};

export const canTransition = (from: ProjectStatus, to: ProjectStatus) =>
  PROJECT_TRANSITIONS[from].includes(to);

// --- Ordering --------------------------------------------------------------------------------

/** `ids` with `id` moved (or inserted) at `index`, clamped to the list. */
export function placeAt<T>(ids: readonly T[], id: T, index: number): T[] {
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(Math.trunc(index), rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * The order a reorder request asks for, checked against what exists: the same ids, each once.
 * Returns null when the request doesn't match (an item was added or removed meanwhile).
 */
export function checkedOrder(existing: readonly string[], requested: readonly string[]) {
  if (requested.length !== existing.length) return null;
  const have = new Set(existing);
  const seen = new Set<string>();
  for (const id of requested) {
    if (!have.has(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return [...requested];
}

// --- Boards ----------------------------------------------------------------------------------

export interface BoardColumnLike {
  id: string;
  category: ColumnCategory;
  sortOrder: number;
}

export interface BoardTaskLike {
  id: string;
  columnId: string | null;
  sortOrder: number;
  completedAt: unknown;
  parentTaskId: string | null;
}

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) =>
  a.sortOrder - b.sortOrder;

/** The column a task lands in when it enters a category: the leftmost column of it. */
export function firstColumnOf<C extends BoardColumnLike>(
  columns: readonly C[],
  category: ColumnCategory,
): C | undefined {
  return [...columns].sort(bySortOrder).find((c) => c.category === category);
}

/** The leftmost column that isn't done (where reopened and new tasks go). */
export function firstOpenColumn<C extends BoardColumnLike>(columns: readonly C[]): C | undefined {
  return firstColumnOf(columns, 'todo') ?? firstColumnOf(columns, 'in_progress');
}

/**
 * Whether a board may become `columns`: it needs a done column (so tasks can be finished) and a
 * column that isn't done (so they can be open).
 */
export function boardProblem(columns: readonly { category: ColumnCategory }[]): string | null {
  if (!columns.some((c) => c.category === 'done')) return 'A board needs a done column.';
  if (!columns.some((c) => c.category !== 'done')) return 'A board needs a column for open tasks.';
  return null;
}

/**
 * A project's next action: the pinned task while it is open, else the top open task on the board,
 * looking at in-progress columns before to-do ones (what you're already doing comes first), each
 * left to right and top to bottom. Subtasks are never picked.
 */
export function pickNextAction(
  pinnedId: string | null,
  columns: readonly BoardColumnLike[],
  tasks: readonly BoardTaskLike[],
): string | null {
  const open = tasks.filter((t) => t.completedAt == null && t.parentTaskId === null);
  if (pinnedId && open.some((t) => t.id === pinnedId)) return pinnedId;

  const sorted = [...columns].sort(bySortOrder);
  for (const category of ['in_progress', 'todo'] as const) {
    for (const column of sorted.filter((c) => c.category === category)) {
      const top = open.filter((t) => t.columnId === column.id).sort(bySortOrder)[0];
      if (top) return top.id;
    }
  }
  return null;
}

export * from './goals';
