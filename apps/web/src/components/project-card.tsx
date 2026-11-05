// A project as a card: icon, title, due date, next action and task progress. Used on the
// Projects page and on an area's page.

import { Link } from '@tanstack/react-router';
import { Pin } from 'lucide-react';
import { EntityIcon } from '@/components/entity-icon';
import { Badge } from '@/components/ui/badge';
import { countdown } from '@/lib/days';
import { STATUS_LABEL } from '@/lib/look';
import type { Project } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ProjectCard({
  project: p,
  today,
  overlay,
  focusable = true,
}: {
  project: Project;
  today: string;
  /** The copy that follows the pointer while dragging. */
  overlay?: boolean;
  /** False when the draggable wrapper takes the focus instead. */
  focusable?: boolean;
}) {
  const total = p.counts.open + p.counts.done;
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: p.id }}
      tabIndex={focusable ? undefined : -1}
      draggable={false}
      className={cn(
        'group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-ring/40 hover:shadow-sm',
        p.status !== 'active' && 'bg-card/60',
        overlay && 'cursor-grabbing shadow-lg ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        <EntityIcon icon={p.icon} color={p.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.title}</div>
          {p.dueDate && (
            <div
              className={cn(
                'text-xs text-muted-foreground',
                p.dueDate < today && p.status === 'active' && 'text-destructive',
              )}
            >
              {countdown(p.dueDate, today)}
            </div>
          )}
        </div>
        {p.status !== 'active' && <Badge variant="secondary">{STATUS_LABEL[p.status]}</Badge>}
      </div>
      {p.status === 'active' && (
        <div className="flex min-h-5 items-center gap-1.5 text-sm">
          {p.nextAction ? (
            <>
              <Pin className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{p.nextAction.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No next action yet</span>
          )}
        </div>
      )}
      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(p.counts.done / total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {p.counts.done}/{total}
          </span>
        </div>
      )}
    </Link>
  );
}
