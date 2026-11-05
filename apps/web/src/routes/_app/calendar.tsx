// The calendar (Phase 4, D35): a month or a week of event occurrences, tasks on their scheduled
// (or due) day, and focus minutes. Drag a task onto another day, or from "No date" onto a day, to
// schedule it there; click an empty part of a day to add an event.

import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { countdownLabel } from '@streaktron/shared/calendar';
import { addDays, startOfWeek } from '@streaktron/shared/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Plus,
  Repeat,
  Timer,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useOpenTask } from '@/hooks/use-open-task';
import { useTaskActions } from '@/lib/actions';
import { formatDayLong, formatMinutes } from '@/lib/days';
import { COLOR } from '@/lib/look';
import {
  calendarQuery,
  meQuery,
  projectsQuery,
  tasksQuery,
  type CalendarRange,
  type Occurrence,
  type Project,
  type Task,
} from '@/lib/queries';
import { editEvent, newEvent } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

type View = 'month' | 'week';

export const Route = createFileRoute('/_app/calendar')({
  validateSearch: (s: Record<string, unknown>): { view?: View; d?: string } => ({
    view: s.view === 'week' || s.view === 'month' ? s.view : undefined,
    d: typeof s.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.d) ? s.d : undefined,
  }),
  component: CalendarPage,
});

/** The drop zone id of the "No date" panel (day ids are YYYY-MM-DD). */
const UNDATED = 'undated';

/** The day under the pointer; the chip's overlap only when there's no pointer (keyboard). */
const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length ? under : rectIntersection(args);
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthTitle = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayTitle = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const atNoon = (d: string) => new Date(`${d}T12:00:00Z`);
const firstOfMonth = (d: string) => `${d.slice(0, 8)}01`;
const addMonths = (d: string, n: number) => {
  const x = atNoon(firstOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
};

/** The day a task shows on: its scheduled day, else its due day. */
const taskDay = (t: Task) => t.scheduledDate ?? t.dueDate;

interface DayItems {
  events: Occurrence[];
  tasks: Task[];
  focus: number;
}

function byDay(data: CalendarRange | undefined, days: string[]): Map<string, DayItems> {
  const map = new Map<string, DayItems>(days.map((d) => [d, { events: [], tasks: [], focus: 0 }]));
  if (!data) return map;
  for (const e of data.events) {
    for (let d = e.date; d <= e.endDate; d = addDays(d, 1)) map.get(d)?.events.push(e);
  }
  for (const t of data.tasks) {
    const d = taskDay(t);
    if (d) map.get(d)?.tasks.push(t);
  }
  for (const f of data.focus) {
    const item = map.get(f.date);
    if (item) item.focus = f.minutes;
  }
  for (const item of map.values()) {
    // All-day first, then by time.
    item.events.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    item.tasks.sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt));
  }
  return map;
}

function CalendarPage() {
  const { data: me } = useQuery(meQuery);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = me?.today ?? '';
  const weekStart = me?.settings.weekStart ?? 1;
  const view: View = search.view ?? 'month';
  const anchor = search.d ?? today;

  const days = useMemo(() => {
    if (!anchor) return [];
    const start =
      view === 'week'
        ? startOfWeek(anchor, weekStart)
        : startOfWeek(firstOfMonth(anchor), weekStart);
    return Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => addDays(start, i));
  }, [anchor, view, weekStart]);
  const from = days[0] ?? '';
  const to = days.at(-1) ?? '';
  const { data } = useQuery({ ...calendarQuery(from, to), enabled: !!from });
  const items = useMemo(() => byDay(data, days), [data, days]);

  const go = (next: { view?: View; d?: string }) =>
    void navigate({ search: (s) => ({ ...s, ...next }), replace: true });
  const step = (n: number) =>
    go({ d: view === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n) });

  const title =
    view === 'month'
      ? monthTitle.format(atNoon(firstOfMonth(anchor || '2000-01-01')))
      : `${dayTitle.format(atNoon(from || '2000-01-01'))} – ${dayTitle.format(atNoon(to || '2000-01-01'))}`;

  if (!me) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Calendar"
        description="Drag a task to another day to schedule it. Click an empty spot on a day to add an event."
        actions={
          <Button onClick={() => newEvent(anchor >= today ? anchor : today)}>
            <Plus /> New event
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => go({ d: undefined })}>
            Today
          </Button>
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="ml-auto flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => go({ view: v })}
              className={cn(
                'rounded-md px-3 py-1 font-medium capitalize',
                view === v ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <Board
        view={view}
        days={days}
        items={items}
        anchor={anchor}
        today={today}
        range={[from, to]}
        onPickDay={(d) => go({ view: 'week', d })}
      />
    </div>
  );
}

// --- Drag and drop ---------------------------------------------------------------------------

function Board({
  view,
  days,
  items,
  anchor,
  today,
  range,
  onPickDay,
}: {
  view: View;
  days: string[];
  items: Map<string, DayItems>;
  anchor: string;
  today: string;
  range: [string, string];
  onPickDay: (d: string) => void;
}) {
  const qc = useQueryClient();
  const tasks = useTaskActions();
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: open = [] } = useQuery(tasksQuery({ status: 'open' }));
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const activeIds = new Set(projects.filter((p) => p.status === 'active').map((p) => p.id));
  const onCalendar = new Set([...items.values()].flatMap((d) => d.tasks.map((t) => t.id)));
  // A task is drawn once: the calendar's copy wins while a refresh catches up.
  const undated = open.filter(
    (t) =>
      !t.dueDate &&
      !t.scheduledDate &&
      !onCalendar.has(t.id) &&
      (t.projectId === null || activeIds.has(t.projectId)),
  );
  // Kept after closing so the dialog's text doesn't go blank while it fades out.
  const [pastDrop, setPastDrop] = useState<{ task: Task; day: string } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const projectOf = (id: string | null) => projects.find((p) => p.id === id);

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.task as Task | undefined) ?? null);
  }

  /** Schedule the task on `day`, or take its planned day away (null). */
  function schedule(task: Task, day: string | null) {
    const moved = { ...task, scheduledDate: day };
    // Show it where it goes at once; the write refreshes the calendar after.
    const key = calendarQuery(range[0], range[1]).queryKey;
    qc.setQueryData<CalendarRange>(key, (cur) => {
      if (!cur) return cur;
      const rest = cur.tasks.filter((t) => t.id !== task.id);
      return { ...cur, tasks: taskDay(moved) ? [...rest, moved] : rest };
    });
    void tasks.update(task, { scheduledDate: day });
    if (!day && task.dueDate) {
      // The due date is a deadline; a drag never moves it (D35).
      toast(`“${task.title}” is still due on ${task.dueDate}, so it stays on that day.`);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = e.active.data.current?.task as Task | undefined;
    const target = e.over?.id as string | undefined;
    if (!task || !target) return;
    if (target === UNDATED) {
      if (task.scheduledDate) schedule(task, null);
      return;
    }
    if (taskDay(task) === target) return;
    if (target < today) {
      setPastDrop({ task, day: target });
      setPastOpen(true);
    } else schedule(task, target);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_14rem]">
        {view === 'month' ? (
          <Month
            days={days}
            items={items}
            anchor={anchor}
            today={today}
            projectOf={projectOf}
            onPickDay={onPickDay}
          />
        ) : (
          <Week days={days} items={items} today={today} projectOf={projectOf} />
        )}
        <Undated tasks={undated} projectOf={projectOf} />
      </div>
      <AlertDialog open={pastOpen} onOpenChange={setPastOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>That day has already passed</AlertDialogTitle>
            <AlertDialogDescription>
              Plan “{pastDrop?.task.title}” for {pastDrop ? formatDayLong(pastDrop.day) : ''}? A day
              that’s over can’t be done anymore, so you probably meant today or a day ahead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (pastDrop) schedule(pastDrop.task, today);
              }}
            >
              Plan it for today
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (pastDrop) schedule(pastDrop.task, pastDrop.day);
              }}
            >
              Yes, that day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DragOverlay>
        {dragging && <TaskChip task={dragging} project={projectOf(dragging.projectId)} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function DayDrop({
  day,
  className,
  children,
}: {
  day: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-primary/10 ring-2 ring-primary/40 ring-inset')}
      onClick={(e) => {
        // Only the empty part of the day: chips handle their own clicks.
        if (e.target === e.currentTarget) newEvent(day);
      }}
    >
      {children}
    </div>
  );
}

// --- Views -----------------------------------------------------------------------------------

const MONTH_ITEMS = 3;

function Month({
  days,
  items,
  anchor,
  today,
  projectOf,
  onPickDay,
}: {
  days: string[];
  items: Map<string, DayItems>;
  anchor: string;
  today: string;
  projectOf: (id: string | null) => Project | undefined;
  onPickDay: (d: string) => void;
}) {
  const month = anchor.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2">
            {WEEKDAY[atNoon(d).getUTCDay()]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const it = items.get(d)!;
          const list = [
            ...it.events.map((e) => ({
              key: `e${e.eventId}${e.date}`,
              node: <EventChip e={e} day={d} projectOf={projectOf} compact />,
            })),
            ...it.tasks.map((t) => ({
              key: `t${t.id}`,
              node: <DraggableTask task={t} project={projectOf(t.projectId)} today={today} />,
            })),
          ];
          const more = list.length - MONTH_ITEMS;
          return (
            <DayDrop
              key={d}
              day={d}
              className={cn(
                'min-h-24 cursor-pointer space-y-0.5 border-r border-b p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0',
                d.slice(0, 7) !== month && 'bg-muted/30 text-muted-foreground',
              )}
            >
              <div className="pointer-events-none flex items-center justify-between px-0.5 text-xs">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full font-medium',
                    d === today && 'bg-primary text-primary-foreground',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {it.focus > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
                    title="Focus that day"
                  >
                    <Timer className="size-3" />
                    {it.focus}m
                  </span>
                )}
              </div>
              {list.slice(0, MONTH_ITEMS).map((x) => (
                <div key={x.key}>{x.node}</div>
              ))}
              {more > 0 && (
                <button
                  className="w-full truncate px-1 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => onPickDay(d)}
                >
                  +{more} more
                </button>
              )}
            </DayDrop>
          );
        })}
      </div>
    </div>
  );
}

function Week({
  days,
  items,
  today,
  projectOf,
}: {
  days: string[];
  items: Map<string, DayItems>;
  today: string;
  projectOf: (id: string | null) => Project | undefined;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const it = items.get(d)!;
        return (
          <div
            key={d}
            className={cn(
              'flex flex-col rounded-xl border bg-card',
              d === today && 'border-primary/60',
            )}
          >
            <div className="flex items-baseline justify-between border-b px-2 py-1.5">
              <span className={cn('text-sm font-semibold', d === today && 'text-primary')}>
                {WEEKDAY[atNoon(d).getUTCDay()]} {Number(d.slice(8))}
              </span>
              {it.focus > 0 && (
                <span
                  className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
                  title="Focus that day"
                >
                  <Timer className="size-3" />
                  {formatMinutes(it.focus)}
                </span>
              )}
            </div>
            <DayDrop day={d} className="min-h-28 flex-1 cursor-pointer space-y-1 p-1.5 md:min-h-64">
              {it.events.map((e) => (
                <EventChip key={`${e.eventId}${e.date}`} e={e} day={d} projectOf={projectOf} />
              ))}
              {it.tasks.map((t) => (
                <DraggableTask key={t.id} task={t} project={projectOf(t.projectId)} today={today} />
              ))}
            </DayDrop>
          </div>
        );
      })}
    </div>
  );
}

function Undated({
  tasks,
  projectOf,
}: {
  tasks: Task[];
  projectOf: (id: string | null) => Project | undefined;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, 12);
  const { setNodeRef, isOver } = useDroppable({ id: UNDATED });
  return (
    <aside
      ref={setNodeRef}
      className={cn(
        'h-fit space-y-2 rounded-xl border bg-card p-2',
        isOver && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
      )}
    >
      <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold">
        <CalendarClock className="size-4 text-primary" /> No date
        <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
      </h3>
      <p className="px-1 text-xs text-muted-foreground">
        Drag one onto a day to plan it, or drop a planned one here to clear its day.
      </p>
      {tasks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Every open task has a date.</p>
      ) : (
        <div className="space-y-1">
          {shown.map((t) => (
            <DraggableTask key={t.id} task={t} project={projectOf(t.projectId)} />
          ))}
          {tasks.length > shown.length && (
            <button
              className="px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setAll(true)}
            >
              Show {tasks.length - shown.length} more
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

// --- Chips -----------------------------------------------------------------------------------

function EventChip({
  e,
  day,
  projectOf,
  compact,
}: {
  e: Occurrence;
  day: string;
  projectOf: (id: string | null) => Project | undefined;
  compact?: boolean;
}) {
  const color = COLOR[projectOf(e.projectId)?.color ?? 'blue'];
  const first = day === e.date;
  const name = first ? e.title : `↳ ${e.title}`;
  const time = e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : '';
  const open = () => editEvent(e.eventId, e.date);
  if (compact) {
    return (
      <button
        type="button"
        onClick={open}
        title={`${e.title}${time ? ` · ${time}` : ''}`}
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-xs font-medium',
          color.tile,
        )}
      >
        {e.countdown && <Hourglass className="size-3 shrink-0" />}
        <span className="min-w-0 truncate">{name}</span>
      </button>
    );
  }
  // Week view: the time on its own line, the title wraps (columns can be narrow).
  return (
    <button
      type="button"
      onClick={open}
      className={cn('block w-full rounded-md px-1.5 py-1 text-left text-xs', color.tile)}
    >
      <span className="flex items-center gap-1 opacity-80">
        {e.countdown && <Hourglass className="size-3 shrink-0" />}
        {e.repeats && <Repeat className="size-3 shrink-0" />}
        <span className="tabular-nums">{first && time ? time : first ? 'All day' : ''}</span>
      </span>
      <span className="line-clamp-3 font-medium break-words">{name}</span>
    </button>
  );
}

function DraggableTask({
  task,
  project,
  today,
}: {
  task: Task;
  project?: Project;
  today?: string;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { task },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && 'opacity-30')}>
      <TaskChip task={task} project={project} today={today} />
    </div>
  );
}

function TaskChip({
  task,
  project,
  today,
  overlay,
}: {
  task: Task;
  project?: Project;
  today?: string;
  overlay?: boolean;
}) {
  const open = useOpenTask();
  const done = task.completedAt !== null;
  const overdue = !done && !!today && !!task.dueDate && task.dueDate < today;
  const dueOnly = !task.scheduledDate && !!task.dueDate;
  return (
    <button
      type="button"
      onClick={() => open(task.id)}
      title={`${task.title}${task.dueDate ? ` · due ${task.dueDate}${today ? ` (${countdownLabel(today, task.dueDate).toLowerCase()})` : ''}` : ''}`}
      className={cn(
        'flex w-full cursor-grab items-center gap-1.5 truncate rounded-md border bg-background px-1.5 py-0.5 text-left text-xs',
        overlay && 'cursor-grabbing shadow-lg',
        done && 'text-muted-foreground line-through',
        overdue && 'border-destructive/50',
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          project ? COLOR[project.color].dot : 'bg-muted-foreground/40',
        )}
      />
      <span className="min-w-0 truncate">{task.title}</span>
      {dueOnly && (
        <span className="ml-auto shrink-0 text-[10px] font-semibold text-destructive/80">due</span>
      )}
    </button>
  );
}
