// The event dialog (new or edit), mounted once in the shell and opened through ui-store. Times are
// wall-clock and dates are the user's days (D35); repetition is a small set of choices that maps
// onto an RRULE on the server.

import { describeRecurrence, type Freq, type Recurrence } from '@streaktron/shared/calendar';
import { useQuery } from '@tanstack/react-query';
import { CalendarX, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useEventActions } from '@/lib/actions';
import { eventQuery, meQuery, projectsQuery, type CalendarEvent } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function EventDialog() {
  const ui = useUi();
  const d = ui.eventDialog;
  const id = d?.eventId;
  const { data: event } = useQuery({ ...eventQuery(id ?? ''), enabled: !!id });
  const close = () => setUi({ eventDialog: null });

  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && close()}>
      {d && (!id || event) && (
        <EventForm
          key={id ?? `new-${d.date ?? ''}`}
          event={event}
          date={d.date}
          occurrence={d.occurrence}
          projectId={d.projectId}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

type Repeat = 'none' | Freq | 'biweekly';

/** A comparable form of a rule (byDay order and empty fields don't matter). */
const ruleKey = (r: Recurrence | null) =>
  r
    ? JSON.stringify([
        r.freq,
        r.interval,
        [...(r.byDay ?? [])].sort().join(','),
        r.until ?? '',
        r.count ?? 0,
      ])
    : '';
type Ends = 'never' | 'until' | 'count';

const NO_PROJECT = 'none';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function EventForm({
  event,
  date,
  occurrence,
  projectId,
  onDone,
}: {
  event?: CalendarEvent;
  date?: string;
  occurrence?: string;
  projectId?: string;
  onDone: () => void;
}) {
  const actions = useEventActions();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const weekStart = me?.settings.weekStart ?? 1;
  const today = me?.today ?? '';
  const r = event?.recurrence ?? null;

  const [title, setTitle] = useState(event?.title ?? '');
  const [startDate, setStartDate] = useState(event?.startDate ?? date ?? today);
  const [allDay, setAllDay] = useState(event ? event.startTime === null : true);
  const [startTime, setStartTime] = useState(event?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [endDate, setEndDate] = useState(event?.endDate ?? '');
  const [repeat, setRepeat] = useState<Repeat>(
    !r ? 'none' : r.freq === 'weekly' && r.interval === 2 ? 'biweekly' : r.freq,
  );
  const [byDay, setByDay] = useState<number[]>(r?.byDay ?? []);
  const [ends, setEnds] = useState<Ends>(r?.until ? 'until' : r?.count ? 'count' : 'never');
  const [until, setUntil] = useState(r?.until ?? '');
  const [count, setCount] = useState(r?.count ?? 10);
  const [project, setProject] = useState(event?.projectId ?? projectId ?? NO_PROJECT);
  const [countdown, setCountdown] = useState(event?.countdown ?? false);
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const weekly = repeat === 'weekly' || repeat === 'biweekly';
  const recurrence: Recurrence | null =
    repeat === 'none'
      ? null
      : {
          freq: repeat === 'biweekly' ? 'weekly' : repeat,
          interval: repeat === 'biweekly' ? 2 : 1,
          ...(weekly && byDay.length ? { byDay } : {}),
          ...(ends === 'until' && until ? { until } : {}),
          ...(ends === 'count' ? { count } : {}),
        };
  const problem = !title.trim()
    ? 'A title'
    : !startDate
      ? 'A date'
      : !allDay && endTime && endTime <= startTime
        ? 'The end time must be after the start'
        : allDay && endDate && endDate < startDate
          ? 'The end date can’t be before the start'
          : recurrence?.until && recurrence.until < startDate
            ? 'The repeat can’t end before the event starts'
            : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    // Sending the rule resets the skipped occurrences, so only send it when it changed.
    const sameRule = event && ruleKey(event.recurrence) === ruleKey(recurrence);
    const fields = {
      title,
      notes,
      startDate,
      endDate: allDay && endDate && endDate !== startDate ? endDate : null,
      startTime: allDay ? null : startTime,
      endTime: allDay || !endTime ? null : endTime,
      ...(sameRule ? {} : { recurrence }),
      countdown,
      projectId: project === NO_PROJECT ? null : project,
    };
    const ok = event ? await actions.update(event.id, fields) : await actions.create(fields);
    setBusy(false);
    if (ok) onDone();
  }

  const ordered = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7);
  const shownDays = byDay.length ? byDay : startDate ? [weekdayOf(startDate)] : [];
  const toggleDay = (d: number) =>
    setByDay((cur) => {
      const base = cur.length ? cur : shownDays;
      const next = base.includes(d) ? base.filter((x) => x !== d) : [...base, d];
      return next.length ? next : base;
    });

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={submit} className="grid gap-5">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit event' : 'New event'}</DialogTitle>
          <DialogDescription>
            Exams, lectures, deadlines, appointments. Mark it as a countdown to see the days left on
            Today.
          </DialogDescription>
        </DialogHeader>

        <Input
          aria-label="Title"
          placeholder="Calculus exam"
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Date" htmlFor="ev-date">
              <Input
                id="ev-date"
                type="date"
                className="w-40"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            {allDay ? (
              <Field label="Until (optional)" htmlFor="ev-end-date">
                <Input
                  id="ev-end-date"
                  type="date"
                  className="w-40"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            ) : (
              <>
                <Field label="From" htmlFor="ev-start">
                  <Input
                    id="ev-start"
                    type="time"
                    className="w-28"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </Field>
                <Field label="To" htmlFor="ev-end">
                  <Input
                    id="ev-end"
                    type="time"
                    className="w-28"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
            All day
          </label>
        </div>

        <div className="grid gap-2">
          <Field label="Repeat">
            <Select value={repeat} onValueChange={(v) => setRepeat(v as Repeat)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Doesn’t repeat</SelectItem>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Every month</SelectItem>
                <SelectItem value="yearly">Every year</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {weekly && (
            <div className="flex items-center gap-1.5">
              {ordered.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={shownDays.includes(d)}
                  aria-label={DAY_NAME[d]}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'grid size-8 place-items-center rounded-full border text-xs font-semibold',
                    shownDays.includes(d)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:border-primary',
                  )}
                >
                  {DAY_LETTER[d]}
                </button>
              ))}
            </div>
          )}
          {recurrence && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Ends</span>
              <Select value={ends} onValueChange={(v) => setEnds(v as Ends)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="until">On a date</SelectItem>
                  <SelectItem value="count">After</SelectItem>
                </SelectContent>
              </Select>
              {ends === 'until' && (
                <Input
                  type="date"
                  aria-label="Repeat until"
                  className="w-40"
                  min={startDate}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              )}
              {ends === 'count' && (
                <>
                  <Input
                    type="number"
                    aria-label="Number of times"
                    min={1}
                    max={999}
                    className="w-20"
                    value={count}
                    onChange={(e) =>
                      setCount(Math.max(1, Math.min(999, Number(e.target.value) || 1)))
                    }
                  />
                  <span className="text-muted-foreground">times</span>
                </>
              )}
            </div>
          )}
          {recurrence && startDate && (
            <p className="text-xs text-muted-foreground">
              {describeRecurrence(recurrence, startDate, weekStart)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Project">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects
                  .filter((p) => p.status !== 'completed' || p.id === event?.projectId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={countdown} onCheckedChange={(v) => setCountdown(v === true)} />
            Count down to it
          </label>
        </div>

        <Field label="Notes" htmlFor="ev-notes">
          <Textarea
            id="ev-notes"
            placeholder="Room, what to bring, what it covers"
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-1">
            {event && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  await actions.remove(event.id, event.title);
                  onDone();
                }}
              >
                <Trash2 /> {event.recurrence ? 'Delete all' : 'Delete'}
              </Button>
            )}
            {event?.recurrence && occurrence && (
              <Button
                type="button"
                variant="ghost"
                title={`Remove only the one on ${occurrence}`}
                onClick={async () => {
                  await actions.skip(event.id, event.title, occurrence);
                  onDone();
                }}
              >
                <CalendarX /> Only this one
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !!problem} title={problem ?? undefined}>
              {event ? 'Save' : 'Create event'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
