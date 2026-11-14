// The new-project dialog's template choice (D52) and what it sends.

import { projectTemplate, type TemplateKey } from '@strekatron/shared/structure';

export interface TemplateChoice {
  key: TemplateKey | null;
  date: string;
  days: number[];
  startTime: string;
  endTime: string;
}

export const NO_TEMPLATE: TemplateChoice = {
  key: null,
  date: '',
  days: [],
  startTime: '',
  endTime: '',
};

/** What to send with the new project, or undefined for a blank board. */
export function templateInput(c: TemplateChoice) {
  if (!c.key) return undefined;
  const t = projectTemplate(c.key);
  const weekly =
    t.weekly && c.days.length && c.startTime && c.endTime
      ? { days: c.days, startTime: c.startTime, endTime: c.endTime }
      : undefined;
  return {
    key: c.key,
    ...(t.date && c.date ? { date: c.date } : {}),
    ...(weekly ? { weekly } : {}),
  };
}

/** Problems that block creating (half-filled class times). */
export function templateProblem(c: TemplateChoice): string | null {
  if (!c.key || !projectTemplate(c.key).weekly) return null;
  const some = c.days.length > 0 || !!c.startTime || !!c.endTime;
  const all = c.days.length > 0 && !!c.startTime && !!c.endTime;
  if (some && !all) return 'For classes, pick the days and both times (or leave them all empty).';
  if (all && c.startTime >= c.endTime) return 'Classes end after they start.';
  return null;
}
