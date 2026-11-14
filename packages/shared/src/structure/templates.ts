// Project templates (plan.md Phase 6, D52): a new project can start from one, with its board
// columns, goals, first tasks and, when the user gives them, a dated event (exam, deadline) with a
// countdown and weekly classes. Static data, the same on the server (it builds the project) and in
// the web app (the picker shows what each one brings).

import type { ColorKey, ColumnCategory, GoalPeriod, IconKey } from './index';

export const TEMPLATE_KEYS = ['course', 'exam', 'paper', 'side'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface ProjectTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  icon: IconKey;
  color: ColorKey;
  columns: { title: string; category: ColumnCategory }[];
  goals: (
    | {
        title: string;
        kind: 'outcome';
        /** Due on the template's date, when given. */ dated?: boolean;
      }
    | { title: string; kind: 'commitment'; targetMinutes: number; period: GoalPeriod }
  )[];
  /** First tasks, in board order; `goal`: the index of the goal they belong to. */
  tasks: { title: string; goal?: number }[];
  /** The column the first tasks go in (index); the first "to do" one when absent. */
  tasksIn?: number;
  /** Asks for a date (exam, deadline): an event on it with a countdown, and the dated goal's due date. */
  date?: { label: string; event: string };
  /** Asks for the days and times of weekly classes: one repeating event. */
  weekly?: { label: string; event: string };
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    key: 'course',
    name: 'Course',
    description: 'A subject this term: classes every week, study time and the exam.',
    icon: 'graduation-cap',
    color: 'blue',
    columns: [
      { title: 'To study', category: 'todo' },
      { title: 'Studying', category: 'in_progress' },
      { title: 'To review', category: 'in_progress' },
      { title: 'Done', category: 'done' },
    ],
    goals: [
      { title: 'Study every week', kind: 'commitment', targetMinutes: 180, period: 'week' },
      { title: 'Pass the exam', kind: 'outcome', dated: true },
    ],
    tasks: [
      { title: 'Read the syllabus' },
      { title: 'Set up a place for notes' },
      { title: 'List the topics for the exam', goal: 1 },
    ],
    date: { label: 'Exam date', event: 'Exam' },
    weekly: { label: 'Classes', event: 'Class' },
  },
  {
    key: 'exam',
    name: 'Exam prep',
    description: 'Getting ready for one exam: every topic covered, practice, a countdown.',
    icon: 'brain',
    color: 'violet',
    columns: [
      { title: 'To review', category: 'todo' },
      { title: 'Reviewing', category: 'in_progress' },
      { title: 'Got it', category: 'done' },
    ],
    goals: [
      { title: 'Review every week', kind: 'commitment', targetMinutes: 300, period: 'week' },
      { title: 'Ready for the exam', kind: 'outcome', dated: true },
    ],
    tasks: [
      { title: 'List every topic', goal: 1 },
      { title: 'Gather past exams', goal: 1 },
      { title: 'Do a practice exam', goal: 1 },
    ],
    date: { label: 'Exam date', event: 'Exam' },
  },
  {
    key: 'paper',
    name: 'Paper or thesis',
    description: 'A long piece of writing: research, draft, revision, and the deadline.',
    icon: 'pen',
    color: 'teal',
    columns: [
      { title: 'To do', category: 'todo' },
      { title: 'Writing', category: 'in_progress' },
      { title: 'In review', category: 'in_progress' },
      { title: 'Done', category: 'done' },
    ],
    goals: [
      { title: 'Write every week', kind: 'commitment', targetMinutes: 240, period: 'week' },
      { title: 'Research done', kind: 'outcome' },
      { title: 'First draft written', kind: 'outcome' },
      { title: 'Final version delivered', kind: 'outcome', dated: true },
    ],
    tasks: [
      { title: 'Agree on the topic and scope', goal: 1 },
      { title: 'Collect the main sources', goal: 1 },
      { title: 'Outline the chapters', goal: 2 },
    ],
    date: { label: 'Deadline', event: 'Deadline' },
  },
  {
    key: 'side',
    name: 'Personal project',
    description: 'Something of your own: ideas, a first version, a little time every week.',
    icon: 'rocket',
    color: 'orange',
    columns: [
      { title: 'Ideas', category: 'todo' },
      { title: 'To do', category: 'todo' },
      { title: 'Doing', category: 'in_progress' },
      { title: 'Done', category: 'done' },
    ],
    goals: [
      { title: 'A little every week', kind: 'commitment', targetMinutes: 120, period: 'week' },
      { title: 'First version working', kind: 'outcome' },
    ],
    tasks: [
      { title: 'Write down what “done” looks like', goal: 1 },
      { title: 'Pick the first small step', goal: 1 },
    ],
    tasksIn: 1,
  },
];

export const projectTemplate = (key: TemplateKey) => PROJECT_TEMPLATES.find((t) => t.key === key)!;
