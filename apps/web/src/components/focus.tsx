// Focus sessions (plan.md §4.4). The session lives on the server (start time and pauses), so a
// reload or another device picks it up; this clock only counts on from what the server said. When
// the planned time is up: a chime, a browser notification, and the finish dialog.

import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Square, Timer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { useGameActions } from '@/lib/actions';
import { chime } from '@/lib/game';
import { focusQuery, meQuery, projectsQuery, taskQuery, type FocusSession } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/** Milliseconds worked, ticking while it runs. */
function useWorkedMs(session: FocusSession | null | undefined, receivedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  const running = session?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  if (!session) return 0;
  return session.workedMs + (running ? Math.max(0, now - receivedAt) : 0);
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'streaktron-focus' });
  } catch {
    // Some browsers (Android) only notify from a service worker; Web Push comes in Phase 4.
  }
}

/** The running session, above the content on every page. */
export function FocusBar() {
  const { data: session, dataUpdatedAt } = useQuery(focusQuery);
  const actions = useGameActions();
  const worked = useWorkedMs(session, dataUpdatedAt);
  const [finishing, setFinishing] = useState(false);
  const rang = useRef<string | null>(null);

  const planned = (session?.plannedMinutes ?? 0) * 60_000;
  const left = planned - worked;
  const over = !!session && left <= 0;

  useEffect(() => {
    if (!session || !over || rang.current === session.id) return;
    rang.current = session.id;
    if (session.status === 'running') {
      chime('focus');
      notify(
        'Focus session done',
        session.task?.title ?? session.project?.title ?? 'Time for a break.',
      );
    }
    setFinishing(true);
  }, [over, session]);

  if (!session) return null;
  const label = session.task?.title ?? session.project?.title ?? 'Focus session';
  const paused = session.status === 'paused';

  return (
    <>
      <div className="sticky top-14 z-10 border-b bg-primary/10 px-4 py-2 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Timer className={cn('size-4 shrink-0 text-primary', !paused && 'animate-pulse')} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{label}</div>
            <div className="h-1 overflow-hidden rounded-full bg-primary/15">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, (worked / planned) * 100)}%` }}
              />
            </div>
          </div>
          <span className="font-mono text-sm tabular-nums" aria-label="Time left">
            {over ? 'Done' : clock(left)}
            {paused && <span className="ml-1 text-xs text-muted-foreground">paused</span>}
          </span>
          {!over &&
            (paused ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Resume"
                onClick={() => void actions.resumeFocus(session.id)}
              >
                <Play />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Pause"
                onClick={() => void actions.pauseFocus(session.id)}
              >
                <Pause />
              </Button>
            ))}
          <Button
            size="sm"
            variant={over ? 'default' : 'outline'}
            onClick={() => setFinishing(true)}
          >
            <Square className="size-3.5" /> Finish
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            aria-label="Abandon session"
            title="Abandon (nothing counts)"
            onClick={() => void actions.abandonFocus(session.id)}
          >
            <X />
          </Button>
        </div>
      </div>
      <FinishDialog
        session={session}
        workedMs={worked}
        open={finishing}
        onOpenChange={setFinishing}
      />
    </>
  );
}

function FinishDialog({
  session,
  workedMs,
  open,
  onOpenChange,
}: {
  session: FocusSession;
  workedMs: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const actions = useGameActions();
  const [note, setNote] = useState('');
  const [completeTask, setCompleteTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const minutes = Math.min(Math.floor(workedMs / 60_000), session.plannedMinutes);
  const taskOpen = session.task && !session.task.completedAt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish the session</DialogTitle>
          <DialogDescription>
            {minutes} minute{minutes === 1 ? '' : 's'} of focus
            {minutes < 10 ? ' (sessions earn XP from 10 minutes).' : '.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="finish-focus"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await actions.finishFocus(session.id, {
              note: note.trim() || undefined,
              completeTask: taskOpen ? completeTask : undefined,
            });
            setBusy(false);
            if (res) {
              setNote('');
              setCompleteTask(false);
              onOpenChange(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="focus-note">Note (optional)</Label>
            <Input
              id="focus-note"
              value={note}
              maxLength={500}
              placeholder="What did you get done?"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {taskOpen && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={completeTask}
                onCheckedChange={(v) => setCompleteTask(v === true)}
              />
              Mark “{session.task!.title}” done
            </label>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {workedMs >= session.plannedMinutes * 60_000 ? 'Not yet' : 'Keep going'}
          </Button>
          <Button type="submit" form="finish-focus" disabled={busy}>
            Finish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE = 'none';

/** Start a session: a preset or a length of your own, attached to a task or a project. */
export function FocusStartDialog() {
  const ui = useUi();
  const attach = ui.focusDialog;
  const close = () => setUi({ focusDialog: null });
  return (
    <Dialog open={!!attach} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        {/* A fresh form each time it opens, starting from what it was opened with. */}
        {attach && <StartForm key={JSON.stringify(attach)} attach={attach} close={close} />}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({
  attach,
  close,
}: {
  attach: { taskId?: string; projectId?: string };
  close: () => void;
}) {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: task } = useQuery({ ...taskQuery(attach.taskId ?? ''), enabled: !!attach.taskId });
  const { data: running } = useQuery(focusQuery);
  const actions = useGameActions();
  const presets = me?.settings.focusPresets ?? [{ focusMinutes: 25, breakMinutes: 5 }];
  const [minutes, setMinutes] = useState(String(presets[0]?.focusMinutes ?? 25));
  const [projectId, setProjectId] = useState<string>(attach.projectId ?? NONE);
  const [busy, setBusy] = useState(false);

  const n = Number(minutes);
  const valid = Number.isInteger(n) && n >= 1 && n <= 240;
  const active = projects.filter((p) => p.status === 'active');

  return (
    <>
      <DialogHeader>
        <DialogTitle>Start a focus session</DialogTitle>
        <DialogDescription>
          {running
            ? 'A session is already running. Finish it first.'
            : 'One block of focused work. It counts from 10 minutes.'}
        </DialogDescription>
      </DialogHeader>
      <form
        id="start-focus"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || running) return;
          setBusy(true);
          if ('Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
          const s = await actions.startFocus({
            plannedMinutes: n,
            ...(attach.taskId
              ? { taskId: attach.taskId }
              : projectId !== NONE
                ? { projectId }
                : {}),
          });
          setBusy(false);
          if (s) close();
        }}
      >
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={`${p.focusMinutes}/${p.breakMinutes}`}
              type="button"
              variant={Number(minutes) === p.focusMinutes ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMinutes(String(p.focusMinutes))}
            >
              {p.focusMinutes} min
            </Button>
          ))}
          <Input
            aria-label="Minutes"
            type="number"
            min={1}
            max={240}
            className="h-8 w-20"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        {attach.taskId ? (
          <p className="text-sm">
            On <span className="font-medium">{task?.title ?? '…'}</span>
          </p>
        ) : (
          <div className="grid gap-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {active.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" form="start-focus" disabled={!valid || busy || !!running}>
          Start
        </Button>
      </DialogFooter>
    </>
  );
}
