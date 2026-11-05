// Countdown chips (Phase 4): events marked "count down", project due dates and task due dates, with
// how many days are left. Clicking one opens what it's about. Used on Today and on a project page.

import { countdownLabel, isSoon } from '@strekatron/shared/calendar';
import { useNavigate } from '@tanstack/react-router';
import { CalendarClock, Flag, Hourglass, type LucideIcon } from 'lucide-react';
import { useOpenSheet } from '@/hooks/use-open-task';
import { editEvent } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export interface CountdownItem {
  kind: 'event' | 'project' | 'task';
  id: string;
  title: string;
  date: string;
  projectId: string | null;
}

const ICON: Record<CountdownItem['kind'], LucideIcon> = {
  event: Hourglass,
  project: Flag,
  task: CalendarClock,
};

const WHAT: Record<CountdownItem['kind'], string> = {
  event: 'Event',
  project: 'Project due',
  task: 'Task',
};

export function Countdowns({
  items,
  today,
  max = 6,
  className,
}: {
  items: CountdownItem[];
  today: string;
  max?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const openSheet = useOpenSheet();
  if (!items.length) return null;

  const open = (c: CountdownItem) => {
    if (c.kind === 'event') editEvent(c.id, c.date);
    else if (c.kind === 'task') openSheet('task', c.id);
    else void navigate({ to: '/projects/$projectId', params: { projectId: c.id } });
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {items.slice(0, max).map((c) => {
        const Icon = ICON[c.kind];
        const soon = isSoon(today, c.date);
        return (
          <button
            key={`${c.kind}${c.id}${c.date}`}
            onClick={() => open(c)}
            title={WHAT[c.kind]}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/50"
          >
            <Icon className={cn('size-4', soon ? 'text-amber-500' : 'text-muted-foreground')} />
            <span>
              <span className="block max-w-48 truncate text-sm font-medium">{c.title}</span>
              <span
                className={cn(
                  'block text-xs',
                  soon ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                )}
              >
                {countdownLabel(today, c.date)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
