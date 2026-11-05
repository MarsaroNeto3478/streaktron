// Habits on screen: the row (check-in, streak, the last week), the list Today and the Habits page
// share, and the new/edit dialog (mounted once in the shell, opened through ui-store).

import { scheduleLabel, type HabitSchedule } from '@strekatron/shared/habits';
import { addDays } from '@strekatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Check,
  Flame,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useHabitActions } from '@/lib/actions';
import { habitsQuery, meQuery, projectsQuery, type Habit } from '@/lib/queries';
import { editHabit, setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

// --- The row ---------------------------------------------------------------------------------

export function HabitRow({ habit, today }: { habit: Habit; today: string }) {
  const actions = useHabitActions();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const project = projects.find((p) => p.id === habit.projectId);
  const weekStart = me?.settings.weekStart ?? 1;
  const archived = habit.archivedAt !== null;
  const yesterday = addDays(today, -1);
  const missedYesterday =
    !archived &&
    !habit.checkedYesterday &&
    habit.recent.find((d) => d.day === yesterday)?.scheduled === true &&
    habit.schedule.type === 'weekdays';
  const done = habit.checkedToday;
  const unit = habit.streak.unit === 'day' ? 'day' : 'week';

  const toggle = () => void (done ? actions.uncheck(habit.id, today) : actions.checkIn(habit.id));

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={archived}
        aria-label={
          done ? `Undo today’s check-in of “${habit.title}”` : `Check in “${habit.title}”`
        }
        onClick={toggle}
        className={cn(
          'group/check grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors disabled:opacity-40',
          done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-muted-foreground/40 hover:border-emerald-500',
        )}
      >
        <Check
          className={cn(
            'size-3.5 stroke-[3]',
            done ? 'opacity-100' : 'text-emerald-500 opacity-0 group-hover/check:opacity-60',
          )}
        />
      </button>

      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => editHabit(habit.id)}
      >
        <div className={cn('truncate text-sm font-medium', done && 'text-muted-foreground')}>
          {habit.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Repeat className="size-3" />
            {scheduleLabel(habit.schedule as HabitSchedule, weekStart)}
            {habit.schedule.type === 'per_week' &&
              ` · ${habit.thisWeek}/${habit.schedule.count} this week`}
          </span>
          {habit.minMinutes && <span>≥ {habit.minMinutes} min</span>}
          {project && <span className="truncate">{project.title}</span>}
          {missedYesterday && (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                void actions.checkIn(habit.id, yesterday);
              }}
            >
              Did it yesterday?
            </button>
          )}
        </div>
      </button>

      <WeekDots habit={habit} />

      <span
        className={cn(
          'inline-flex w-12 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold tabular-nums',
          habit.streak.current > 0 ? 'text-orange-500' : 'text-muted-foreground/50',
        )}
        title={`${habit.streak.current} ${unit}${habit.streak.current === 1 ? '' : 's'} in a row · best ${habit.streak.longest}`}
      >
        <Flame className="size-3.5" />
        {habit.streak.current}
        <span className="font-normal">{unit === 'day' ? 'd' : 'w'}</span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-60 group-hover:opacity-100"
            aria-label={`${habit.title} menu`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => editHabit(habit.id)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {habit.checkedYesterday && !archived && (
            <DropdownMenuItem onSelect={() => void actions.uncheck(habit.id, yesterday)}>
              <Undo2 /> Undo yesterday’s check-in
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void actions.archive(habit, !archived)}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? 'Bring back' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(habit)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The last 7 days: filled when checked, outlined when scheduled, faint otherwise. */
function WeekDots({ habit }: { habit: Habit }) {
  return (
    <div className="hidden items-center gap-1 sm:flex" aria-hidden>
      {habit.recent.map((d) => (
        <span
          key={d.day}
          title={`${DAY_NAME[weekdayOf(d.day)]} ${d.day}${d.checked ? ' · done' : ''}`}
          className={cn(
            'grid size-4 place-items-center rounded-sm text-[8px] font-semibold',
            d.checked
              ? 'bg-emerald-500 text-white'
              : d.scheduled
                ? 'border border-muted-foreground/40 text-muted-foreground'
                : 'text-muted-foreground/40',
          )}
        >
          {DAY_LETTER[weekdayOf(d.day)]}
        </span>
      ))}
    </div>
  );
}

// --- The dialog ------------------------------------------------------------------------------

export function HabitDialog() {
  const ui = useUi();
  const { data: habits } = useQuery(habitsQuery(false));
  const { data: archived } = useQuery({ ...habitsQuery(true), enabled: !!ui.habitDialog?.habitId });
  const id = ui.habitDialog?.habitId;
  const habit = id
    ? (habits?.find((h) => h.id === id) ?? archived?.find((h) => h.id === id))
    : undefined;
  const close = () => setUi({ habitDialog: null });

  return (
    <Dialog open={!!ui.habitDialog} onOpenChange={(o) => !o && close()}>
      {ui.habitDialog && (!id || habit) && (
        <HabitForm
          key={id ?? 'new'}
          habit={habit}
          projectId={ui.habitDialog.projectId}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

const NO_PROJECT = 'none';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function HabitForm({
  habit,
  projectId,
  onDone,
}: {
  habit?: Habit;
  projectId?: string;
  onDone: () => void;
}) {
  const actions = useHabitActions();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const weekStart = me?.settings.weekStart ?? 1;
  const ordered = ALL_DAYS.map((i) => (i + weekStart) % 7);

  const s = habit?.schedule;
  const [title, setTitle] = useState(habit?.title ?? '');
  const [kind, setKind] = useState<'weekdays' | 'per_week'>(s?.type ?? 'weekdays');
  const [days, setDays] = useState<number[]>(s?.type === 'weekdays' ? s.days : ALL_DAYS);
  const [count, setCount] = useState(s?.type === 'per_week' ? s.count : 3);
  const [minMinutes, setMinMinutes] = useState(habit?.minMinutes ? String(habit.minMinutes) : '');
  const [project, setProject] = useState(habit?.projectId ?? projectId ?? NO_PROJECT);
  const [notes, setNotes] = useState(habit?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const schedule: HabitSchedule =
    kind === 'weekdays' ? { type: 'weekdays', days } : { type: 'per_week', count };
  const valid = title.trim() !== '' && (kind === 'per_week' || days.length > 0);
  const choosable = projects.filter((p) => p.status !== 'completed' || p.id === habit?.projectId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const fields = {
      title,
      schedule,
      notes,
      minMinutes: minMinutes ? Math.max(1, Math.min(600, Number(minMinutes))) : null,
      projectId: project === NO_PROJECT ? null : project,
    };
    const ok = habit ? await actions.update(habit.id, fields) : await actions.create(fields);
    setBusy(false);
    if (ok) onDone();
  }

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={submit} className="grid gap-5">
        <DialogHeader>
          <DialogTitle>{habit ? 'Edit habit' : 'New habit'}</DialogTitle>
          <DialogDescription>
            Something you want to keep doing. Each check-in is worth 10 XP (from the day after you
            make it; up to 50 XP a day from habits) and counts as an active day.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Title"
          placeholder="Read 20 pages"
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid gap-2">
          <Label>How often</Label>
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(
              [
                ['weekdays', 'On certain days'],
                ['per_week', 'Times a week'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 font-medium',
                  kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === 'weekdays' ? (
            <div className="flex items-center gap-1.5">
              {ordered.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  aria-label={DAY_NAME[d]}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'grid size-9 place-items-center rounded-full border text-sm font-semibold',
                    days.includes(d)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:border-primary',
                  )}
                >
                  {DAY_LETTER[d]}
                </button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">
                {days.length ? scheduleLabel(schedule, weekStart) : 'Pick at least one day'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="number"
                min={1}
                max={7}
                className="w-20"
                aria-label="Times a week"
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
              />
              <span className="text-muted-foreground">times a week, any days</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="habit-min">At least (minutes)</Label>
            <Input
              id="habit-min"
              type="number"
              min={1}
              max={600}
              placeholder="Optional"
              value={minMinutes}
              onChange={(e) => setMinMinutes(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Project</Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {choosable.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="habit-notes">Notes</Label>
          <Textarea
            id="habit-notes"
            placeholder="Why it matters, or how small it can get on a bad day"
            value={notes}
            maxLength={2000}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {habit ? 'Save' : 'Create habit'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
