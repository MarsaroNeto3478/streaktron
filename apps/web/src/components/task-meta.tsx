import { isSoon } from '@streaktron/shared/calendar';
import { CalendarClock, CalendarDays, ListChecks, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDayShort } from '@/lib/days';
import type { Goal, Project, Task } from '@/lib/queries';
import { isOverdue } from '@/lib/task-list';
import { cn } from '@/lib/utils';
import { EntityIcon } from './entity-icon';

function Chip({
  className,
  children,
  title,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground [&>svg]:size-3.5',
        className,
      )}
    >
      {children}
    </span>
  );
}

const EFFORT_LABEL = { S: 'Small', M: 'Medium', L: 'Large' } as const;

export function EffortBadge({ effort }: { effort: 'S' | 'M' | 'L' }) {
  return (
    <span
      title={`Effort: ${EFFORT_LABEL[effort]}`}
      className="grid h-5 min-w-5 place-items-center rounded border px-1 text-[10px] font-bold text-muted-foreground"
    >
      {effort}
    </span>
  );
}

/** A date within three days, like the countdowns (D39). */
const soonClass = 'font-medium text-amber-600 dark:text-amber-400';

/** The small facts under or beside a task title. */
export function TaskMeta({
  task,
  today,
  project,
  goal,
}: {
  task: Task;
  today: string;
  project?: Project;
  goal?: Goal;
}) {
  const late = isOverdue(task, today);
  const done = task.completedAt !== null;
  return (
    <>
      {project && (
        <Chip title={project.title} className="max-w-40">
          <EntityIcon icon={project.icon} color={project.color} size="sm" />
          <span className="truncate">{project.title}</span>
        </Chip>
      )}
      {task.dueDate && (
        <Chip
          title={`Due ${task.dueDate}`}
          className={cn(
            late && 'font-semibold text-destructive',
            !late && !done && isSoon(today, task.dueDate) && soonClass,
            done && 'line-through',
          )}
        >
          <CalendarDays />
          {formatDayShort(task.dueDate, today)}
        </Chip>
      )}
      {task.scheduledDate && !done && (
        <Chip
          title={`Scheduled for ${task.scheduledDate}`}
          className={cn(isSoon(today, task.scheduledDate) && soonClass)}
        >
          <CalendarClock />
          {formatDayShort(task.scheduledDate, today)}
        </Chip>
      )}
      {task.subtasks.total > 0 && (
        <Chip title="Subtasks done">
          <ListChecks />
          {task.subtasks.done}/{task.subtasks.total}
        </Chip>
      )}
      {goal && (
        <Chip title={`Goal: ${goal.title}`} className="max-w-40">
          <Target />
          <span className="truncate">{goal.title}</span>
        </Chip>
      )}
      {task.effort && <EffortBadge effort={task.effort} />}
    </>
  );
}
