// A goal's details, in a side sheet opened by the `goal` search param from anywhere (a mention
// chip, a backlink, the palette, the goals panel). Title and description save as you type.

import type { RichDoc } from '@strekatron/shared/rich';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, CircleOff, Pencil, RotateCcw, Target, Timer, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useStructureActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { countdown, formatDayShort, formatMinutes } from '@/lib/days';
import { onRowsKeyDown } from '@/lib/rows';
import { goalQuery, meQuery, projectsQuery, tasksQuery, type Goal } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Backlinks } from './backlinks';
import { EntityIcon } from './entity-icon';
import { GoalForm } from './goals-panel';
import { RichEditor } from './rich-editor';
import { SheetBar, TitleField } from './sheet-parts';
import { CommitmentProgress } from './commitment-progress';
import { TaskRow } from './task-row';

export function GoalSheet({ goalId }: { goalId: string | undefined }) {
  const open = useOpenSheet();
  const { data, error, isFetchedAfterMount } = useQuery({
    ...goalQuery(goalId ?? ''),
    enabled: !!goalId,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('That goal doesn’t exist anymore.');
      open('goal', undefined);
    }
  }, [error, open]);

  return (
    <Sheet open={!!goalId} onOpenChange={(o) => !o && open('goal', undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {/* Fresh data only: the editors start from it (see task-sheet.tsx). */}
        {data && data.id === goalId && isFetchedAfterMount ? (
          <GoalEditor key={data.id} goal={data} />
        ) : (
          <div className="p-6">
            <SheetTitle className="sr-only">Goal</SheetTitle>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GoalEditor({ goal }: { goal: Goal }) {
  const actions = useStructureActions();
  const open = useOpenSheet();
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: projectTasks = [] } = useQuery(tasksQuery({ project: goal.projectId }));
  const [editing, setEditing] = useState(false);
  const today = me?.today ?? '';
  const project = projects.find((p) => p.id === goal.projectId);
  const tasks = projectTasks.filter((t) => t.goalId === goal.id);
  const done = tasks.filter((t) => t.completedAt).length;

  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState<RichDoc | null>(goal.description);
  const save = useAutosave(
    { title, description },
    (v) => (v.title.trim() ? actions.saveGoal(goal, v) : Promise.resolve()),
    { what: 'the goal' },
  );
  const close = () => open('goal', undefined);
  const Icon = goal.kind === 'commitment' ? Timer : Target;

  return (
    <div className="flex min-h-full flex-col">
      <SheetBar status={save.status} onClose={close}>
        {project && (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <EntityIcon icon={project.icon} color={project.color} size="sm" />
            {project.title}
          </Link>
        )}
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Icon className="mt-2.5 size-5 shrink-0 text-primary" aria-hidden />
          <SheetTitle className="sr-only">{goal.title}</SheetTitle>
          <SheetDescription className="sr-only">Goal details</SheetDescription>
          <TitleField
            value={title}
            onChange={setTitle}
            what="goal"
            struck={goal.status === 'achieved'}
          />
        </div>

        <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {goal.status === 'open' ? (
              <>
                <span>Open</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => void actions.updateGoal(goal, { status: 'achieved' })}
                >
                  <Check />
                  Achieved
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => void actions.updateGoal(goal, { status: 'dropped' })}
                >
                  <CircleOff />
                  Drop
                </Button>
              </>
            ) : (
              <>
                <Badge variant="secondary">
                  {goal.status === 'achieved' ? 'Achieved' : 'Dropped'}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => void actions.updateGoal(goal, { status: 'open' })}
                >
                  <RotateCcw />
                  Reopen
                </Button>
              </>
            )}
          </dd>
          <dt className="text-muted-foreground">Kind</dt>
          <dd className="flex items-center gap-2">
            {goal.kind === 'commitment' && goal.targetMinutes && goal.period
              ? `Commitment · ${formatMinutes(goal.targetMinutes)} of focus a ${goal.period}`
              : 'Outcome'}
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Edit kind, target and deadline"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          </dd>
          <dt className="text-muted-foreground">
            {goal.kind === 'outcome' ? 'Deadline' : 'Until'}
          </dt>
          <dd className={cn(goal.dueDate && goal.dueDate < today && 'text-destructive')}>
            {goal.dueDate
              ? `${formatDayShort(goal.dueDate, today)} · ${countdown(goal.dueDate, today)}`
              : '—'}
          </dd>
        </dl>

        {goal.progress && goal.period && (
          <section className="grid gap-1.5" aria-label="Progress">
            <h3 className="text-sm font-medium text-muted-foreground">Focus on this project</h3>
            <CommitmentProgress progress={goal.progress} period={goal.period} detailed />
          </section>
        )}

        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">Description</Label>
          <RichEditor
            aria-label="Description"
            value={goal.description}
            onChange={setDescription}
            selfId={goal.id}
            placeholder="Why it matters, what counts as done… Type @ to link things."
          />
        </div>

        <section className="grid gap-1" aria-label="Tasks for this goal">
          <h3 className="flex items-baseline gap-2 text-sm font-medium text-muted-foreground">
            Tasks
            {tasks.length > 0 && (
              <span className="text-xs font-normal">
                {done}/{tasks.length}
              </span>
            )}
          </h3>
          {tasks.length ? (
            <div className="-mx-2 grid" onKeyDown={onRowsKeyDown}>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No tasks yet. Pick this goal in a task’s Goal field.
            </p>
          )}
        </section>

        <Backlinks id={goal.id} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-4 py-3 sm:px-6">
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            await save.flush();
            close();
            void actions.deleteGoal(goal);
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && (
          <GoalForm
            projectId={goal.projectId}
            goal={goal}
            onDone={() => {
              setEditing(false);
              // The form may have renamed it.
              const fresh = qc.getQueryData<Goal>(['goal', goal.id]);
              if (fresh && fresh.title !== title) {
                setTitle(fresh.title);
                save.accept({ title: fresh.title, description });
              }
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
