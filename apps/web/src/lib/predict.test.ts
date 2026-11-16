import { describe, expect, it } from 'vitest';
import { predictCreate, predictHabit, predictPatch } from './predict';
import type { BoardColumn, Habit, Task } from './queries';

const NOW = new Date('2026-11-16T15:00:00.000Z');

const column = (id: string, category: BoardColumn['category'], sortOrder: number) =>
  ({ id, projectId: 'prj_a', title: id, category, sortOrder }) as BoardColumn;
const COLUMNS = [
  column('col_done', 'done', 2),
  column('col_todo', 'todo', 0),
  column('col_doing', 'in_progress', 1),
];

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tsk_1',
  projectId: 'prj_a',
  goalId: 'gol_1',
  parentTaskId: null,
  columnId: 'col_doing',
  title: 'Read',
  descriptionText: '',
  effort: null,
  dueDate: null,
  scheduledDate: null,
  sortOrder: 3,
  completedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  status: 'in_progress',
  subtasks: { total: 0, done: 0 },
  ...over,
});

describe('predictCreate', () => {
  it('an inbox capture: no project, no column, at the bottom', () => {
    const t = predictCreate({ id: 'tsk_new', title: 'Buy paper' }, { now: NOW });
    expect(t).toMatchObject({
      id: 'tsk_new',
      projectId: null,
      columnId: null,
      status: 'todo',
      completedAt: null,
      createdAt: NOW.toISOString(),
      descriptionText: '',
    });
    expect(t.sortOrder).toBeGreaterThan(1e6);
  });

  it('on a board: the first open column, or the one asked for', () => {
    const first = predictCreate(
      { id: 'tsk_a', title: 'A', projectId: 'prj_a', position: 'top' },
      { columns: COLUMNS, now: NOW },
    );
    expect(first).toMatchObject({ columnId: 'col_todo', status: 'todo' });
    expect(first.sortOrder).toBeLessThan(-1e6);

    const done = predictCreate(
      { id: 'tsk_b', title: 'B', projectId: 'prj_a', columnId: 'col_done' },
      { columns: COLUMNS, now: NOW },
    );
    expect(done).toMatchObject({
      columnId: 'col_done',
      status: 'done',
      completedAt: NOW.toISOString(),
    });
  });

  it('a subtask joins its parent’s project and stays off the board', () => {
    const t = predictCreate(
      { id: 'tsk_s', title: 'Sub', parentTaskId: 'tsk_1' },
      { parent: task(), columns: COLUMNS, now: NOW },
    );
    expect(t).toMatchObject({ projectId: 'prj_a', parentTaskId: 'tsk_1', columnId: null });
  });

  it('keeps the text of a description', () => {
    const t = predictCreate(
      {
        id: 'tsk_d',
        title: 'D',
        description: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pages 10–20' }] }],
        },
      },
      { now: NOW },
    );
    expect(t.descriptionText).toBe('Pages 10–20');
  });
});

describe('predictPatch', () => {
  it('applies the fields', () => {
    const t = predictPatch(task(), { title: 'Read ch. 2', dueDate: '2026-11-20' }, { now: NOW });
    expect(t).toMatchObject({ title: 'Read ch. 2', dueDate: '2026-11-20', columnId: 'col_doing' });
    expect(t.updatedAt).toBe(NOW.toISOString());
  });

  it('moving to another project lands on its first open column and drops the goal', () => {
    const t = predictPatch(task(), { projectId: 'prj_b' }, { columns: COLUMNS });
    expect(t).toMatchObject({ projectId: 'prj_b', columnId: 'col_todo', goalId: null });
    expect(predictPatch(task(), { projectId: null })).toMatchObject({ columnId: null });
  });
});

const habit = (over: Partial<Habit> = {}): Habit =>
  ({
    id: 'hab_1',
    title: 'Stretch',
    schedule: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    checkedToday: false,
    checkedYesterday: true,
    thisWeek: 2,
    streak: { current: 2, longest: 2, unit: 'day' },
    recent: [
      { day: '2026-11-15', checked: true, scheduled: true },
      { day: '2026-11-16', checked: false, scheduled: true },
    ],
    ...over,
  }) as Habit;

describe('predictHabit', () => {
  const today = '2026-11-16';

  it('checking in today ticks today and moves a day streak', () => {
    const h = predictHabit(habit(), today, true, today);
    expect(h.checkedToday).toBe(true);
    expect(h.recent.at(-1)?.checked).toBe(true);
    expect(h.streak).toMatchObject({ current: 3, longest: 3 });
  });

  it('unchecking yesterday leaves the streak to the server', () => {
    const h = predictHabit(habit(), '2026-11-15', false, today);
    expect(h.checkedYesterday).toBe(false);
    expect(h.recent[0]?.checked).toBe(false);
    expect(h.streak.current).toBe(2);
  });

  it('counts the week for per-week habits; a repeat changes nothing', () => {
    const weekly = habit({
      schedule: { type: 'per_week', count: 3 },
      streak: { current: 1, longest: 1, unit: 'week' },
    });
    expect(predictHabit(weekly, today, true, today).thisWeek).toBe(3);
    const done = habit({ checkedToday: true });
    expect(predictHabit(done, today, true, today)).toBe(done);
  });
});
