// Zod schemas shared by the server (validation) and the web app (forms, types).

import { z } from 'zod';
import { isId, type IdKind } from '../ids';
import { LINKABLE_KINDS, linkableKind, MAX_RICH_BYTES, type RichDoc } from '../rich';
import {
  COLORS,
  COLUMN_CATEGORIES,
  EFFORTS,
  GOAL_KINDS,
  GOAL_PERIODS,
  GOAL_STATUSES,
  ICONS,
  PROJECT_STATUSES,
  type GoalKind,
  type GoalPeriod,
} from '../structure';
import { isDateString, isValidTimeZone } from '../time';
import { RESTABLE_TYPES } from '../game/quests';

export const dateString = z.string().refine(isDateString, 'Expected a YYYY-MM-DD day');

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone');

/** An id of one kind, e.g. `idOf('task')` accepts `tsk_…` only. */
export const idOf = (kind: IdKind) =>
  z.string().refine((s) => isId(s, kind), `Expected a ${kind} id`);

// --- Errors ----------------------------------------------------------------------------------

/** Every failed API response has this body, so the client can show one clear message. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// --- Setup (the first account) ---------------------------------------------------------------

export const setupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  timezone: timeZone,
});
export type SetupInput = z.infer<typeof setupSchema>;

// --- User settings ---------------------------------------------------------------------------

export const focusPresetSchema = z.object({
  focusMinutes: z.int().min(1).max(240),
  breakMinutes: z.int().min(0).max(60),
});

export const questSettingsSchema = z.object({
  /** Quest types turned off by the user (every type but comeback can rest). */
  restingTypes: z.array(z.string()).max(20),
  timeQuestMinMinutes: z.int().min(5).max(600),
  timeQuestMaxMinutes: z.int().min(5).max(600),
});

export const userSettingsSchema = z.object({
  timezone: timeZone,
  dayStartHour: z.int().min(0).max(23),
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: z.int().min(0).max(6),
  activeProjectLimit: z.int().min(1).max(20),
  weeklyActiveDayTarget: z.int().min(1).max(7),
  focusPresets: z.array(focusPresetSchema).min(1).max(6),
  questSettings: questSettingsSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  timezone: 'UTC',
  dayStartHour: 4,
  weekStart: 1,
  activeProjectLimit: 3,
  weeklyActiveDayTarget: 4,
  focusPresets: [
    { focusMinutes: 25, breakMinutes: 5 },
    { focusMinutes: 50, breakMinutes: 10 },
  ],
  questSettings: { restingTypes: [], timeQuestMinMinutes: 15, timeQuestMaxMinutes: 180 },
};

// --- Structure: areas, projects, columns, goals, tasks --------------------------------------

export const title = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(200, 'Keep it under 200 characters');

const isNode = (v: unknown): v is { type: string } =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/** A TipTap document (checked loosely: the editor owns its shape), or null for empty. */
export const richDoc = z
  .custom<RichDoc>(
    (v) =>
      isNode(v) &&
      v.type === 'doc' &&
      ((v as RichDoc).content === undefined ||
        (Array.isArray((v as RichDoc).content) && (v as RichDoc).content!.every(isNode))),
    'Expected a rich-text document',
  )
  .refine((d) => JSON.stringify(d).length <= MAX_RICH_BYTES, 'That text is too long');

const description = richDoc.nullable();
const color = z.enum(COLORS);
const icon = z.enum(ICONS);
const optionalDay = dateString.nullable();

export const reorderSchema = z.object({ ids: z.array(z.string()).max(1000) });
export type ReorderInput = z.infer<typeof reorderSchema>;

export const areaCreateSchema = z.object({
  title,
  description: description.optional(),
  color: color.optional(),
  icon: icon.optional(),
});
export type AreaCreate = z.infer<typeof areaCreateSchema>;

export const areaPatchSchema = z
  .object({ title, description, color, icon, archived: z.boolean() })
  .partial();
export type AreaPatch = z.infer<typeof areaPatchSchema>;

export const areaDeleteQuerySchema = z.object({
  /** What happens to the area's projects: moved out of it (kept), or deleted with it. */
  projects: z.enum(['keep', 'delete']).default('keep'),
});

export const projectCreateSchema = z.object({
  title,
  areaId: idOf('area').nullable().optional(),
  /** New projects start active, or parked; activating still respects the active limit. */
  status: z.enum(['active', 'parked']).default('active'),
  description: description.optional(),
  color: color.optional(),
  icon: icon.optional(),
  startDate: optionalDay.optional(),
  dueDate: optionalDay.optional(),
});
export type ProjectCreate = z.input<typeof projectCreateSchema>;

export const projectPatchSchema = z
  .object({
    title,
    areaId: idOf('area').nullable(),
    description,
    color,
    icon,
    startDate: optionalDay,
    dueDate: optionalDay,
    /** Pin a task as the next action, or null to go back to the automatic one. */
    nextActionTaskId: idOf('task').nullable(),
  })
  .partial();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

/** Drag on the Projects page: into an area (or none) at `index` among its projects in progress. */
export const projectMoveSchema = z.object({
  areaId: idOf('area').nullable(),
  index: z.int().min(0),
});
export type ProjectMove = z.infer<typeof projectMoveSchema>;

export const projectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  /** Park this active project in the same step, to make room under the limit. */
  park: idOf('project').optional(),
});
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;

export const columnCreateSchema = z.object({
  title: title.max(60),
  category: z.enum(COLUMN_CATEGORIES),
});
export type ColumnCreate = z.infer<typeof columnCreateSchema>;

export const columnPatchSchema = columnCreateSchema.partial();
export type ColumnPatch = z.infer<typeof columnPatchSchema>;

export const columnDeleteQuerySchema = z.object({
  /** Where the column's tasks go; by default the leftmost other column of the same category. */
  moveTo: idOf('boardColumn').optional(),
});

const goalFields = {
  title,
  description,
  kind: z.enum(GOAL_KINDS),
  /** Commitment goals: minutes of focus per period. */
  targetMinutes: z.int().min(5).max(10_000).nullable(),
  period: z.enum(GOAL_PERIODS).nullable(),
  /** Outcome goals: an optional deadline. */
  dueDate: optionalDay,
};

/** A commitment goal needs a target and a period; an outcome goal has neither. */
export const goalShapeProblem = (g: {
  kind: GoalKind;
  targetMinutes: number | null;
  period: GoalPeriod | null;
}) =>
  g.kind === 'commitment' && (g.targetMinutes == null || g.period == null)
    ? 'A commitment goal needs a target and a period'
    : null;

export const goalCreateSchema = z
  .object({
    projectId: idOf('project'),
    ...goalFields,
    description: description.optional(),
    targetMinutes: goalFields.targetMinutes.optional().default(null),
    period: goalFields.period.optional().default(null),
    dueDate: optionalDay.optional(),
  })
  .superRefine((g, ctx) => {
    const problem = goalShapeProblem(g);
    if (problem) ctx.addIssue({ code: 'custom', path: ['targetMinutes'], message: problem });
  });
export type GoalCreate = z.input<typeof goalCreateSchema>;

export const goalPatchSchema = z.object({ ...goalFields, status: z.enum(GOAL_STATUSES) }).partial();
export type GoalPatch = z.infer<typeof goalPatchSchema>;

const taskFields = {
  title,
  description,
  effort: z.enum(EFFORTS).nullable(),
  dueDate: optionalDay,
  scheduledDate: optionalDay,
  /** null: the inbox. */
  projectId: idOf('project').nullable(),
  goalId: idOf('goal').nullable(),
};

export const taskCreateSchema = z.object({
  ...taskFields,
  description: description.optional(),
  effort: taskFields.effort.optional(),
  dueDate: optionalDay.optional(),
  scheduledDate: optionalDay.optional(),
  projectId: taskFields.projectId.optional(),
  goalId: taskFields.goalId.optional(),
  /** A subtask (one level): it joins its parent's project. */
  parentTaskId: idOf('task').optional(),
  /** Board column; by default the project's leftmost open column. */
  columnId: idOf('boardColumn').optional(),
  /** Where in its column or list it goes. */
  position: z.enum(['top', 'bottom']).default('bottom'),
});
export type TaskCreate = z.input<typeof taskCreateSchema>;

export const taskPatchSchema = z.object(taskFields).partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const taskMoveSchema = z.object({
  columnId: idOf('boardColumn'),
  index: z.int().min(0),
});
export type TaskMove = z.infer<typeof taskMoveSchema>;

export const taskListQuerySchema = z.object({
  /** A project id, `inbox`, or every task when left out. */
  project: z.union([idOf('project'), z.literal('inbox')]).optional(),
  status: z.enum(['open', 'done', 'any']).default('any'),
  /** Subtasks of this task. Without it, lists hold top-level tasks only. */
  parent: idOf('task').optional(),
});
export type TaskListQuery = z.input<typeof taskListQuerySchema>;

/** A comma-separated query value as a list (`?ids=a,b`), empty items dropped. */
const commaList = z
  .string()
  .max(5000)
  .transform((s) => s.split(',').filter(Boolean));

export const searchQuerySchema = z.object({
  /** Empty: recently changed open things. */
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Only these kinds (`task,goal`). */
  types: commaList.pipe(z.array(z.enum(LINKABLE_KINDS)).max(LINKABLE_KINDS.length)).optional(),
});

// --- Links (D4) -------------------------------------------------------------------------------

/** Any id a mention can point to. */
export const linkableId = z.string().refine((s) => linkableKind(s) !== null, 'Expected an id');

/** Mention chips ask for many ids at once. */
export const MAX_RESOLVE_IDS = 100;

export const resolveQuerySchema = z.object({
  ids: commaList.pipe(z.array(linkableId).min(1).max(MAX_RESOLVE_IDS)),
});

export const settingsPatchSchema = userSettingsSchema
  .extend({
    questSettings: questSettingsSchema
      .extend({ restingTypes: z.array(z.enum(RESTABLE_TYPES)).max(RESTABLE_TYPES.length) })
      .refine((q) => q.timeQuestMinMinutes <= q.timeQuestMaxMinutes, {
        message: 'The minimum can’t be above the maximum',
        path: ['timeQuestMaxMinutes'],
      }),
  })
  .partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Time zone and day start can change once a week, so days can't be farmed (D17). */
export const DAY_SETTINGS_LOCK_DAYS = 7;

// --- Focus sessions and stats ----------------------------------------------------------------

export const focusStartSchema = z.object({
  plannedMinutes: z.int().min(1).max(240),
  /** Attach to a task (its project comes along) or just a project; neither is fine too. */
  taskId: idOf('task').nullable().optional(),
  projectId: idOf('project').nullable().optional(),
});
export type FocusStart = z.infer<typeof focusStartSchema>;

export const focusFinishSchema = z.object({
  note: z.string().trim().max(500).optional(),
  /** Also complete the attached task. */
  completeTask: z.boolean().optional(),
});
export type FocusFinish = z.infer<typeof focusFinishSchema>;

export const dayRangeSchema = z
  .object({ from: dateString, to: dateString })
  .refine((r) => r.from <= r.to, { message: '`from` must not be after `to`', path: ['to'] });
