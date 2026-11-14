import { describe, expect, it } from 'vitest';
import { PROJECT_TEMPLATES, TEMPLATE_KEYS } from './templates';

describe('project templates (D52)', () => {
  it('every template makes a board that works', () => {
    expect(PROJECT_TEMPLATES.map((t) => t.key)).toEqual([...TEMPLATE_KEYS]);
    for (const t of PROJECT_TEMPLATES) {
      const cats = t.columns.map((c) => c.category);
      expect(cats, t.key).toContain('todo');
      expect(
        cats.filter((c) => c === 'done'),
        t.key,
      ).toHaveLength(1);
      expect(cats.at(-1), t.key).toBe('done');
      for (const task of t.tasks) {
        if (task.goal !== undefined) expect(t.goals[task.goal], t.key).toBeDefined();
      }
      if (t.tasksIn !== undefined) expect(t.columns[t.tasksIn]?.category, t.key).toBe('todo');
      // A dated goal only where the template asks for a date.
      const dated = t.goals.some((g) => g.kind === 'outcome' && g.dated);
      expect(dated, t.key).toBe(!!t.date);
    }
  });
});
