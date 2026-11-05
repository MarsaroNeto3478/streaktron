import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarDays, Hourglass, ListTodo, Plus, Repeat, Timer } from 'lucide-react';
import { useState } from 'react';
import { GameHeader } from '@/components/game-header';
import { HabitRow } from '@/components/habits';
import { countdownLabel } from '@streaktron/shared/calendar';
import { GAME } from '@streaktron/shared/game';
import { QuestBoard } from '@/components/quest-board';
import { TaskRow } from '@/components/task-row';
import { TutorialCard } from '@/components/tutorial-card';
import { Button } from '@/components/ui/button';
import { formatDayLong } from '@/lib/days';
import {
  focusQuery,
  meQuery,
  projectsQuery,
  todayQuery,
  type FocusItem,
  type Habit,
  type TodayData,
} from '@/lib/queries';
import { editEvent, newEvent, newHabit, openPalette, startFocus } from '@/lib/ui-store';

export const Route = createFileRoute('/_app/today')({
  component: TodayPage,
});

/**
 * Today shows a few things; the rest waits behind "show more" (plan.md §4.3). Fewer when not
 * knowing what to do next is the user's challenge (D36).
 */
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

      <TutorialCard />
      <GameHeader />
      <Agenda data={today} today={me.today} />
      <FocusList
        items={today?.focus}
        today={me.today}
        visible={me.settings.challenge === 'next_step' ? GAME.challenge.todayVisible : VISIBLE}
      />
      <TodayHabits habits={today?.habits} today={me.today} />
      <QuestBoard />
    </div>
  );
}

function FocusList({
  items,
  today,
  visible,
}: {
  items: FocusItem[] | undefined;
  today: string;
  visible: number;
}) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const [all, setAll] = useState(false);
  if (!items) return <div className="h-32 animate-pulse rounded-xl bg-muted/60" />;
  const shown = all ? items : items.slice(0, visible);

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
          {items.length > visible && (
            <button
              className="w-full px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setAll((a) => !a)}
            >
              {all ? 'Show less' : `Show ${items.length - visible} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TodayHabits({ habits, today }: { habits: Habit[] | undefined; today: string }) {
  if (!habits) return null;
  const done = habits.filter((h) => h.checkedToday).length;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Repeat className="size-4 text-emerald-500" /> Habits
          {habits.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {done}/{habits.length}
            </span>
          )}
        </h2>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => newHabit()}>
          <Plus className="size-3.5" /> Habit
        </Button>
      </div>
      {habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No habits due today.{' '}
          <Link to="/habits" className="font-medium text-primary hover:underline">
            See all habits
          </Link>
        </p>
      ) : (
        <div className="rounded-xl border bg-card p-1">
          {habits.map((h) => (
            <HabitRow key={h.id} habit={h} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Today's events and the countdowns; hidden when there's neither. */
function Agenda({ data, today }: { data: TodayData | undefined; today: string }) {
  if (!data || (!data.agenda.length && !data.countdowns.length)) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-4 text-sky-500" /> Agenda
        </h2>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => newEvent(today)}>
          <Plus className="size-3.5" /> Event
        </Button>
      </div>
      {data.countdowns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.countdowns.slice(0, 6).map((c) => (
            <button
              key={c.eventId}
              onClick={() => editEvent(c.eventId, c.date)}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/50"
            >
              <Hourglass className="size-4 text-amber-500" />
              <span>
                <span className="block text-sm font-medium">{c.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {countdownLabel(today, c.date)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {data.agenda.length > 0 && (
        <div className="divide-y rounded-xl border bg-card">
          {data.agenda.map((e) => (
            <button
              key={`${e.eventId}${e.date}`}
              onClick={() => editEvent(e.eventId, e.date)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-muted/40"
            >
              <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                {e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : 'All day'}
              </span>
              <span className="truncate font-medium">{e.title}</span>
              {e.repeats && <Repeat className="ml-auto size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
