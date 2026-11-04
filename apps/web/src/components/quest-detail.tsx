// What a quest asks and where to do it: opened by clicking a quest on Today. Each template gets a
// plain explanation, how its progress counts, and a button that goes to the right place (the
// task, the project, the inbox, the habits, or the focus timer).

import { PART_LABELS, QUEST_TYPE_LABELS, type DetailPart } from '@streaktron/shared/game';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Check, Dices, Gift, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useGameActions } from '@/lib/actions';
import { formatDayLong, formatMinutes } from '@/lib/days';
import type { Quest } from '@/lib/queries';
import { startFocus } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

interface Go {
  label: string;
  icon?: ReactNode;
  run: () => void;
}

interface Explained {
  what: ReactNode;
  counts: ReactNode;
  go?: Go;
}

function useExplain(q: Quest): Explained {
  const navigate = useNavigate();
  const openSheet = useOpenSheet();
  const projectId = q.params.projectId as string | undefined;
  const target = q.targetEntityId ?? undefined;

  const toProject = (label: string): Go | undefined =>
    projectId
      ? {
          label,
          run: () => void navigate({ to: '/projects/$projectId', params: { projectId } }),
        }
      : undefined;
  const openTask = (label: string): Go | undefined =>
    target ? { label, run: () => openSheet('task', target) } : undefined;
  const focus = (label = 'Start a focus session'): Go => ({
    label,
    icon: <Timer />,
    run: () => startFocus(projectId ? { projectId } : {}),
  });
  const toHabits: Go = { label: 'Go to Habits', run: () => void navigate({ to: '/habits' }) };
  const activeDay =
    'An active day is one where you complete a task, finish a focus session of 10+ minutes, or check in a habit.';

  switch (q.templateKey) {
    case 'quick.triage':
      return {
        what: 'Take one task from your Inbox and give it a project (or just complete it).',
        counts: 'Moving an inbox task into a project, or completing one in the Inbox.',
        go: { label: 'Go to Inbox', run: () => void navigate({ to: '/inbox' }) },
      };
    case 'quick.pin_next':
      return {
        what: 'Choose the one task this project should move on next and pin it as the next action.',
        counts:
          'Pinning a task as this project’s next action: open a task and choose “Pin as next action”.',
        go: toProject('Open the project'),
      };
    case 'quick.subtask':
      return {
        what: 'Tick off any subtask.',
        counts: 'Completing a subtask of any task.',
        go: { label: 'Go to all tasks', run: () => void navigate({ to: '/tasks' }) },
      };
    case 'quick.habit':
      return {
        what: 'Check in one of your habits.',
        counts: 'Any habit check-in made today.',
        go: toHabits,
      };
    case 'daily.top_item':
      return {
        what: 'Finish the task at the top of your Focus list.',
        counts: 'Completing this exact task today.',
        go: openTask('Open the task'),
      };
    case 'daily.stale_project':
      return {
        what: 'This project hasn’t moved in a while. Complete one of its tasks to get it going.',
        counts: 'Completing any task (not a subtask) of this project today.',
        go: toProject('Open the project'),
      };
    case 'daily.project_task':
      return {
        what: 'Complete a task in this project.',
        counts: 'Completing any task (not a subtask) of this project today.',
        go: toProject('Open the project'),
      };
    case 'daily.two_tasks':
      return {
        what: 'Complete two tasks today, from anywhere.',
        counts: 'Every completed task counts; subtasks don’t.',
        go: { label: 'Go to all tasks', run: () => void navigate({ to: '/tasks' }) },
      };
    case 'daily.focus_session':
      return {
        what: 'Finish one focus session of at least 25 minutes.',
        counts: 'A focus session finished today with 25 minutes or more.',
        go: focus(),
      };
    case 'daily.all_habits':
      return {
        what: `Check in every habit that was due when today’s board was made (${q.target}).`,
        counts: 'Check-ins for today of those habits; a late check-in for yesterday doesn’t count.',
        go: toHabits,
      };
    case 'time.day':
      return {
        what: `Focus for ${formatMinutes(q.target)} today, in as many sessions as you like.`,
        counts: 'The minutes of every focus session finished today, on any project.',
        go: focus(),
      };
    case 'time.week':
      return {
        what: `Focus for ${formatMinutes(q.target)} this week, in as many sessions as you like.`,
        counts: 'The minutes of every focus session finished this week, on any project.',
        go: focus(),
      };
    case 'weekly.target':
      return {
        what: `Be active on ${q.target} days this week.`,
        counts: activeDay,
      };
    case 'comeback.focus':
      return {
        what: 'Welcome back. One short session is enough to restart: 10 minutes of focus.',
        counts: 'A focus session of 10 minutes or more, finished today.',
        go: focus('Start 10 minutes'),
      };
    case 'make.task':
      return {
        what: 'Add a new task to this project.',
        counts:
          'Creating a task in the project, or moving a task from the Inbox into it. Afterwards a follow-up asks for a couple of its details.',
        go: toProject('Open the project'),
      };
    case 'make.goal':
      return {
        what: 'This project has no goals yet. Add one: an outcome (with an optional deadline) or a commitment of focus time.',
        counts:
          'Creating a goal in the project. Afterwards a follow-up asks for a couple of its details.',
        go: toProject('Open the project'),
      };
    case 'make.subtasks':
      return {
        what: `This is a big task. Break it into ${q.target} subtasks.`,
        counts: 'Subtasks added to this task after the quest appeared.',
        go: openTask('Open the task'),
      };
    case 'follow_up.task':
    case 'follow_up.goal': {
      const kind = q.templateKey === 'follow_up.goal' ? 'goal' : 'task';
      return {
        what: `You just made this ${kind}. Fill in ${q.target} of the details it’s missing, so it’s ready to work on.`,
        counts: 'Any of the parts listed above; each one filled counts once.',
        go: target ? { label: `Open the ${kind}`, run: () => openSheet(kind, target) } : undefined,
      };
    }
    default:
      return { what: q.title, counts: 'Progress updates as you work.' };
  }
}

export function QuestDetail({
  quest: q,
  open,
  onOpenChange,
}: {
  quest: Quest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Body quest={q} close={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function Body({ quest: q, close }: { quest: Quest; close: () => void }) {
  const actions = useGameActions();
  const [busy, setBusy] = useState(false);
  const { what, counts, go } = useExplain(q);
  const done = q.status === 'completed';
  const minutes = q.templateKey.startsWith('time.');
  const pct = Math.min(100, (q.progress / q.target) * 100);
  const isFollowUp = q.type === 'follow_up';
  const asked = (q.params.missing as DetailPart[] | undefined) ?? [];
  const filled = new Set(q.filled ?? []);
  const until =
    q.periodStart === q.periodEnd ? 'Today only' : `Until ${formatDayLong(q.periodEnd)}`;

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-px font-medium">
            {QUEST_TYPE_LABELS[q.type]}
          </span>
          <span>{until}</span>
        </div>
        <DialogTitle className={cn(done && 'text-muted-foreground line-through')}>
          {q.title}
        </DialogTitle>
        <DialogDescription>{what}</DialogDescription>
      </DialogHeader>

      {isFollowUp && !done && asked.length > 0 && (
        <ul className="grid gap-1.5 rounded-lg border p-3 text-sm">
          {asked.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-4 place-items-center rounded-full border',
                  filled.has(p)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40',
                )}
              >
                {filled.has(p) && <Check className="size-2.5 stroke-[3]" />}
              </span>
              <span className={cn(filled.has(p) && 'text-muted-foreground line-through')}>
                Add {PART_LABELS[p]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-muted-foreground tabular-nums">
            {done
              ? 'Done'
              : minutes
                ? `${formatMinutes(q.progress)} / ${formatMinutes(q.target)}`
                : `${q.progress} / ${q.target}`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary/80" style={{ width: `${done ? 100 : pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">What counts: </span>
          {counts}
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Gift className="size-4 text-primary" />
        <span>
          <span className="font-semibold">+{q.xp} XP</span>
          <span className="text-muted-foreground">{done ? ' earned' : ' when it’s done'}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {q.canReroll && !done && (
          <Button
            variant="ghost"
            disabled={busy}
            title="Swap for another quest of the same kind (once)"
            onClick={async () => {
              setBusy(true);
              await actions.reroll(q.id);
              setBusy(false);
              close();
            }}
          >
            <Dices /> Swap it
          </Button>
        )}
        {go && !done && (
          <Button
            onClick={() => {
              close();
              go.run();
            }}
          >
            {go.icon} {go.label} {!go.icon && <ArrowRight />}
          </Button>
        )}
      </div>
    </DialogContent>
  );
}
