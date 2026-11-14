import { addDays } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, boardColumns, calendarEvents, goals, tasks } from '../src/db/schema';
import { client, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let today: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  today = (await as.get('/api/me')).body.today;
});

describe('project templates (D52)', () => {
  it('builds a course: its columns, goals, first tasks, exam countdown and weekly classes', async () => {
    const exam = addDays(today, 60);
    const res = await as.post('/api/projects', {
      title: 'Calculus',
      template: {
        key: 'course',
        date: exam,
        weekly: { days: [1, 3], startTime: '10:00', endTime: '11:40' },
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = res.body;
    expect([p.icon, p.color, p.dueDate]).toEqual(['graduation-cap', 'blue', exam]);

    const cols = await db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.projectId, p.id))
      .orderBy(boardColumns.sortOrder);
    expect(cols.map((c) => c.title)).toEqual(['To study', 'Studying', 'To review', 'Done']);

    const gs = await db
      .select()
      .from(goals)
      .where(eq(goals.projectId, p.id))
      .orderBy(goals.sortOrder);
    expect(gs.map((g) => [g.title, g.kind, g.targetMinutes, g.dueDate])).toEqual([
      ['Study every week', 'commitment', 180, null],
      ['Pass the exam', 'outcome', null, exam],
    ]);

    const ts = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, p.id))
      .orderBy(tasks.sortOrder);
    expect(ts.map((t) => t.title)).toEqual([
      'Read the syllabus',
      'Set up a place for notes',
      'List the topics for the exam',
    ]);
    expect(new Set(ts.map((t) => t.columnId))).toEqual(new Set([cols[0]!.id]));
    expect(ts[2]!.goalId).toBe(gs[1]!.id);

    const evs = await db.select().from(calendarEvents).where(eq(calendarEvents.projectId, p.id));
    const byTitle = new Map(evs.map((e) => [e.title, e]));
    expect(byTitle.get('Exam: Calculus')).toMatchObject({ startDate: exam, countdown: true });
    expect(byTitle.get('Class: Calculus')).toMatchObject({
      startDate: today,
      startTime: '10:00',
      endTime: '11:40',
      recurrence: `FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=${exam.replaceAll('-', '')}`,
    });

    // A template is a starting point, not work done: only the project counts as made.
    const made = await db.select().from(activity).where(eq(activity.type, 'item_created'));
    expect(made.map((a) => a.entityId)).toEqual([p.id]);
  });

  it('works without the optional dates, and keeps the plain project as it was', async () => {
    const side = (await as.post('/api/projects', { title: 'Game', template: { key: 'side' } }))
      .body;
    const ts = await db.select().from(tasks).where(eq(tasks.projectId, side.id));
    const cols = await db.select().from(boardColumns).where(eq(boardColumns.projectId, side.id));
    const toDo = cols.find((c) => c.title === 'To do')!;
    expect(ts.every((t) => t.columnId === toDo.id)).toBe(true);
    expect(await db.select().from(calendarEvents)).toEqual([]);

    const plain = (await as.post('/api/projects', { title: 'Plain' })).body;
    const plainCols = await db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.projectId, plain.id));
    expect(plainCols).toHaveLength(3);
    expect(await db.select().from(goals).where(eq(goals.projectId, plain.id))).toEqual([]);

    const bad = await as.post('/api/projects', {
      title: 'X',
      template: { key: 'course', weekly: { days: [1], startTime: '11:00', endTime: '10:00' } },
    });
    expect(bad.status).toBe(400);
  });
});
