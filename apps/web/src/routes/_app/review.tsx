// The weekly review (D38): about five minutes, one step at a time. What the last seven days held,
// what stalled, the inbox, next actions, which projects stay active, and two lines about the week.
// Finishing it gives XP, makes the day active and completes the week's review quest.

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, CirclePause, CirclePlay, Pin } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EntityIcon } from '@/components/entity-icon';
import { PageHeader } from '@/components/page-header';
import { Streaky } from '@/components/streaky';
import { TaskListView } from '@/components/task-list-view';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useReviewActions, useStructureActions } from '@/lib/actions';
import { formatDayLong, formatMinutes } from '@/lib/days';
import { useProjectStatus } from '@/lib/project-status';
import {
  projectsQuery,
  reviewQuery,
  reviewsQuery,
  tasksQuery,
  type CurrentReview,
  type PastReview,
  type Project,
} from '@/lib/queries';
import { DEFAULT_LIST } from '@/lib/task-list';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/review')({
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewQuery),
  component: ReviewPage,
});

const STEPS = [
  'Your week',
  'What stalled',
  'Inbox',
  'Next actions',
  'Active projects',
  'Looking back',
] as const;

function ReviewPage() {
  const { data: r } = useQuery(reviewQuery);
  if (!r) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Weekly review"
        description={`The last seven days: ${formatDayLong(r.summary.from)} to ${formatDayLong(r.summary.to)}.`}
      />
      {r.done ? <Done review={r.done} /> : <Steps r={r} />}
      <History current={r.done?.id} />
    </div>
  );
}

function Steps({ r }: { r: CurrentReview }) {
  const [step, setStep] = useState(0);
  const [wentWell, setWentWell] = useState('');
  const [change, setChange] = useState('');
  const [busy, setBusy] = useState(false);
  const review = useReviewActions();
  const last = step === STEPS.length - 1;

  return (
    <div className="space-y-5">
      {!r.window && step === 0 && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          The review is meant for the end of the week, but you can do it now. It counts once a week.
        </p>
      )}
      <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                i === step
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i < step
                    ? 'border-primary/40 text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {i < step && <Check className="mr-1 inline size-3" />}
              {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="min-h-64 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold">{STEPS[step]}</h2>
        {step === 0 && <Week r={r} />}
        {step === 1 && <Stalled r={r} />}
        {step === 2 && <InboxStep />}
        {step === 3 && <NextActions />}
        {step === 4 && <ActiveProjects stalled={new Set(r.stalled.map((p) => p.id))} />}
        {step === 5 && (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="went-well">What went well this week?</Label>
              <Textarea
                id="went-well"
                rows={3}
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="Finished the first chapter, three gym days in a row…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="change">What will you do differently next week?</Label>
              <Textarea
                id="change"
                rows={3}
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="Start with the hardest task in the morning…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Both are optional. Finishing gives 50 XP, counts as an active day and completes the
              week’s review quest.
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft /> Back
        </Button>
        {last ? (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await review.complete({ wentWell, change });
              setBusy(false);
            }}
          >
            <Check /> Finish the review
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SummaryTiles({ s }: { s: CurrentReview['summary'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Tile label="Tasks done" value={s.tasksDone} />
      <Tile label="Focus" value={formatMinutes(s.focusMinutes)} />
      <Tile label="Active days" value={`${s.activeDays}/7`} />
      <Tile label="Habit check-ins" value={s.habitCheckins} />
      <Tile label="XP" value={s.xp} />
    </div>
  );
}

function Week({ r }: { r: CurrentReview }) {
  const moved = r.projects.filter((p) => p.tasks > 0 || p.focusMinutes > 0);
  return (
    <div className="space-y-4">
      <SummaryTiles s={r.summary} />
      {moved.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground">Where the work went</h3>
          <ul className="divide-y rounded-lg border">
            {moved.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <EntityIcon icon={p.icon} color={p.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {p.tasks} task{p.tasks === 1 ? '' : 's'} · {formatMinutes(p.focusMinutes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stalled({ r }: { r: CurrentReview }) {
  if (!r.stalled.length) {
    return <p className="text-sm text-muted-foreground">Every active project moved this week.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These active projects had no finished task and no focus in the last seven days. Give each
        one a small next step, or park it in a later step.
      </p>
      <ul className="divide-y rounded-lg border">
        {r.stalled.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <EntityIcon icon={p.icon} color={p.color} size="sm" />
            <Link
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {p.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {p.lastWorked ? `Last worked ${formatDayLong(p.lastWorked)}` : 'Never worked on'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InboxStep() {
  const { data: tasks = [] } = useQuery(tasksQuery({ project: 'inbox', status: 'open' }));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Open each task to give it a project, finish it, or delete it.
      </p>
      <TaskListView
        tasks={tasks}
        showProject={false}
        options={{ ...DEFAULT_LIST, project: 'inbox', sort: 'board', group: 'none' }}
        empty="Inbox zero. Everything has a home."
      />
    </div>
  );
}

function NextActions() {
  const { data: projects = [] } = useQuery(projectsQuery);
  const active = projects.filter((p) => p.status === 'active');
  if (!active.length) return <p className="text-sm text-muted-foreground">No active projects.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        One next action per project: the first thing you’ll do when you open it. It shows on Today.
      </p>
      <ul className="divide-y rounded-lg border">
        {active.map((p) => (
          <NextActionRow key={p.id} project={p} />
        ))}
      </ul>
    </div>
  );
}

const NONE = 'none';

function NextActionRow({ project: p }: { project: Project }) {
  const { data: tasks = [] } = useQuery(tasksQuery({ project: p.id, status: 'open' }));
  const actions = useStructureActions();
  const open = tasks.filter((t) => !t.parentTaskId && !t.completedAt);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <EntityIcon icon={p.icon} color={p.color} size="sm" />
      <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
      {open.length ? (
        <Select
          value={p.nextAction?.id ?? NONE}
          onValueChange={(v) =>
            void actions.updateProject(p.id, { nextActionTaskId: v === NONE ? null : v })
          }
        >
          <SelectTrigger className="h-8 w-full sm:w-64" aria-label={`Next action for ${p.title}`}>
            <Pin className="size-3.5 text-primary" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No next action</SelectItem>
            {open.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Link
          to="/projects/$projectId"
          params={{ projectId: p.id }}
          className="text-xs text-primary hover:underline"
        >
          No open tasks: add one
        </Link>
      )}
    </li>
  );
}

function ActiveProjects({ stalled }: { stalled: ReadonlySet<string> }) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const change = useProjectStatus();
  const active = projects.filter((p) => p.status === 'active');
  const parked = projects.filter((p) => p.status === 'parked');
  const row = (p: Project, action: ReactNode) => (
    <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
      <EntityIcon icon={p.icon} color={p.color} size="sm" />
      <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
      {stalled.has(p.id) && <span className="text-xs text-amber-600">Stalled</span>}
      {action}
    </li>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Keep active what you’ll really work on next week. Parking a project quiets it on Today and
        in quests until you bring it back.
      </p>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">Active</h3>
        <ul className="divide-y rounded-lg border">
          {active.map((p) =>
            row(
              p,
              <Button variant="ghost" size="sm" onClick={() => void change(p, 'parked')}>
                <CirclePause /> Park
              </Button>,
            ),
          )}
          {!active.length && <li className="px-3 py-2 text-sm text-muted-foreground">None.</li>}
        </ul>
      </div>
      {parked.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground">Parked</h3>
          <ul className="divide-y rounded-lg border">
            {parked.map((p) =>
              row(
                p,
                <Button variant="ghost" size="sm" onClick={() => void change(p, 'active')}>
                  <CirclePlay /> Make active
                </Button>,
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Done({ review }: { review: PastReview }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <Streaky mood="celebrating" size={88} />
        <div>
          <p className="font-semibold">This week’s review is done.</p>
          <p className="text-sm text-muted-foreground">
            See you at the end of next week. Your answers are below.
          </p>
        </div>
      </div>
      <Answers review={review} />
    </section>
  );
}

function Answers({ review }: { review: PastReview }) {
  return (
    <div className="space-y-3">
      <SummaryTiles s={review.summary} />
      {review.wentWell && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">What went well</div>
          <p className="text-sm whitespace-pre-line">{review.wentWell}</p>
        </div>
      )}
      {review.change && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">What to change</div>
          <p className="text-sm whitespace-pre-line">{review.change}</p>
        </div>
      )}
    </div>
  );
}

function History({ current }: { current?: string }) {
  const { data: reviews = [] } = useQuery(reviewsQuery);
  const past = reviews.filter((r) => r.id !== current);
  const [open, setOpen] = useState<string | null>(null);
  if (!past.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Past reviews</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {past.map((r) => (
          <li key={r.id}>
            <button
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/40"
              onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
              aria-expanded={open === r.id}
            >
              <span className="font-medium">Week of {formatDayLong(r.weekStart)}</span>
              <span className="text-xs text-muted-foreground">
                {r.summary.tasksDone} tasks · {formatMinutes(r.summary.focusMinutes)}
              </span>
            </button>
            {open === r.id && (
              <div className="px-4 pb-4">
                <Answers review={r} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
