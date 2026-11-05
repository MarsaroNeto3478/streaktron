// A project's goals: outcomes (with an optional deadline) and commitments (focus minutes per
// week or month). A commitment shows its progress from focus on the project and its pace (D40).

import type { GoalKind, GoalPeriod, GoalStatus } from '@strekatron/shared/structure';
import {
  Check,
  CircleOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { useOpenSheet } from '@/hooks/use-open-task';
import { useStructureActions } from '@/lib/actions';
import { countdown } from '@/lib/days';
import type { Goal, Task } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CommitmentProgress } from './commitment-progress';

export function GoalsPanel({
  projectId,
  goals,
  tasks,
  today,
}: {
  projectId: string;
  goals: Goal[];
  tasks: Task[];
  today: string;
}) {
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const open = goals.filter((g) => g.status === 'open');
  const closed = goals.filter((g) => g.status !== 'open');

  return (
    <section className="space-y-3" aria-label="Goals">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Goals</h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing('new')}>
          <Plus />
          Goal
        </Button>
      </div>
      {goals.length === 0 && (
        <button
          onClick={() => setEditing('new')}
          className="w-full rounded-xl border border-dashed px-4 py-6 text-left text-sm text-muted-foreground hover:bg-muted/40"
        >
          What is this project aiming for? An outcome (“Pass the exam”) or a commitment (“4 hours a
          week”).
        </button>
      )}
      <div className="grid gap-2">
        {[...open, ...closed].map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            today={today}
            tasks={tasks.filter((t) => t.goalId === g.id)}
            onEdit={() => setEditing(g)}
          />
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <GoalForm
            key={editing === 'new' ? 'new' : editing.id}
            projectId={projectId}
            goal={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function GoalRow({
  goal,
  tasks,
  today,
  onEdit,
}: {
  goal: Goal;
  tasks: Task[];
  today: string;
  onEdit: () => void;
}) {
  const actions = useStructureActions();
  const openSheet = useOpenSheet();
  const done = tasks.filter((t) => t.completedAt).length;
  const setStatus = (status: GoalStatus) => void actions.updateGoal(goal, { status });
  const Icon = goal.kind === 'commitment' ? Timer : Target;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-card px-4 py-3',
        goal.status !== 'open' && 'opacity-70',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={cn(
              'text-left text-sm font-medium hover:underline',
              goal.status === 'achieved' && 'line-through',
            )}
            onClick={() => openSheet('goal', goal.id)}
          >
            {goal.title}
          </button>
          {goal.status !== 'open' && (
            <Badge variant="secondary">{goal.status === 'achieved' ? 'Achieved' : 'Dropped'}</Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {goal.dueDate && goal.status === 'open' && (
            <span className={cn(goal.dueDate < today && 'text-destructive')}>
              {countdown(goal.dueDate, today)}
            </span>
          )}
          {tasks.length > 0 && (
            <span>
              {done}/{tasks.length} tasks done
            </span>
          )}
        </div>
        {goal.progress && goal.period && goal.status === 'open' && (
          <div className="mt-2 max-w-md">
            <CommitmentProgress progress={goal.progress} period={goal.period} />
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`${goal.title} menu`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {goal.status === 'open' ? (
            <>
              <DropdownMenuItem onSelect={() => setStatus('achieved')}>
                <Check />
                Mark achieved
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStatus('dropped')}>
                <CircleOff />
                Drop it
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus('open')}>
              <RotateCcw />
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void actions.deleteGoal(goal)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function GoalForm({
  projectId,
  goal,
  onDone,
}: {
  projectId: string;
  goal?: Goal;
  onDone: () => void;
}) {
  const actions = useStructureActions();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'outcome');
  const [hours, setHours] = useState(goal?.targetMinutes ? String(goal.targetMinutes / 60) : '4');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week');
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? '');
  const [busy, setBusy] = useState(false);

  const minutes = Math.round(Number(hours) * 60);
  const validTarget = kind === 'outcome' || (Number.isFinite(minutes) && minutes >= 5);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !validTarget) return;
    setBusy(true);
    const fields = {
      title,
      kind,
      targetMinutes: kind === 'commitment' ? minutes : null,
      period: kind === 'commitment' ? period : null,
      dueDate: dueDate || null,
    };
    const ok = goal
      ? await actions.updateGoal(goal, fields)
      : await actions.createGoal({ projectId, ...fields });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>
            {kind === 'outcome'
              ? 'A result you’re after, optionally by a date.'
              : 'A regular effort: focus time per week or month.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
          {(['outcome', 'commitment'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium text-muted-foreground',
                kind === k && 'bg-background text-foreground shadow-xs',
              )}
            >
              {k === 'outcome' ? <Target className="size-4" /> : <Timer className="size-4" />}
              {k === 'outcome' ? 'Outcome' : 'Commitment'}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goal-title">Title</Label>
          <Input
            id="goal-title"
            autoFocus
            maxLength={200}
            placeholder={kind === 'outcome' ? 'Pass the final exam' : 'Study every week'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {kind === 'commitment' && (
          <div className="grid gap-1.5">
            <Label htmlFor="goal-hours">Target</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                id="goal-hours"
                type="number"
                min={0.25}
                step={0.25}
                className="w-24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              hours of focus a
              <select
                aria-label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
                className="h-9 rounded-md border bg-transparent px-2"
              >
                <option value="week">week</option>
                <option value="month">month</option>
              </select>
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="goal-due">{kind === 'outcome' ? 'Deadline' : 'Until'} (optional)</Label>
          <Input
            id="goal-due"
            type="date"
            className="w-44"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !validTarget}>
            {goal ? 'Save' : 'Add goal'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
