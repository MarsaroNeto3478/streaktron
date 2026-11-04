import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ListTodo, Timer } from 'lucide-react';
import { useState } from 'react';
import { GameHeader } from '@/components/game-header';
import { QuestBoard } from '@/components/quest-board';
import { TaskRow } from '@/components/task-row';
import { Button } from '@/components/ui/button';
import { formatDayLong } from '@/lib/days';
import { focusQuery, meQuery, projectsQuery, todayQuery, type FocusItem } from '@/lib/queries';
import { openPalette, startFocus } from '@/lib/ui-store';

export const Route = createFileRoute('/_app/today')({
  component: TodayPage,
});

/** Today shows a few things; the rest waits behind "show more" (plan.md §4.3). */
const VISIBLE = 5;

const REASON: Record<FocusItem['reason'], string> = {
  overdue: 'Overdue',
  due: 'Due today',
  scheduled: 'Planned for today',
  next: 'Next action',
};

function TodayPage() {
  const { data: me } = useQuery(meQuery);
  const { data: today } = useQuery(todayQuery);
  const { data: session } = useQuery(focusQuery);
  if (!me) return null;
  const first = me.user.name.split(/\s+/)[0];
  const top = today?.focus[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{formatDayLong(me.today)}</p>
          <h1 className="text-2xl font-bold tracking-tight">Hi, {first}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What’s the smallest meaningful thing you can do right now?
          </p>
        </div>
        <Button
          size="lg"
          disabled={!!session}
          onClick={() => startFocus(top ? { taskId: top.task.id } : {})}
          title={top ? `On “${top.task.title}”` : undefined}
        >
          <Timer /> {session ? 'Focus running' : 'Start focus'}
        </Button>
      </div>

      <GameHeader />
      <FocusList items={today?.focus} today={me.today} />
      <QuestBoard />
    </div>
  );
}

function FocusList({ items, today }: { items: FocusItem[] | undefined; today: string }) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const [all, setAll] = useState(false);
  if (!items) return <div className="h-32 animate-pulse rounded-xl bg-muted/60" />;
  const shown = all ? items : items.slice(0, VISIBLE);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ListTodo className="size-4 text-primary" /> Focus
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing due and no next actions.{' '}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => openPalette('capture')}
          >
            Capture a task
          </button>{' '}
          or give an active project something to do.
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-1">
          {shown.map((item) => (
            <div key={item.task.id} className="group relative">
              <TaskRow
                task={item.task}
                today={today}
                project={projects.find((p) => p.id === item.task.projectId)}
              />
              <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground group-hover:hidden">
                  {REASON[item.reason]}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto hidden h-7 group-focus-within:flex group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    startFocus({ taskId: item.task.id });
                  }}
                >
                  <Timer className="size-3.5" /> Focus
                </Button>
              </div>
            </div>
          ))}
          {items.length > VISIBLE && (
            <button
              className="w-full px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setAll((a) => !a)}
            >
              {all ? 'Show less' : `Show ${items.length - VISIBLE} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
