import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronRight, Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { HabitRow } from '@/components/habits';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { habitsQuery, meQuery, type Habit } from '@/lib/queries';
import { newHabit } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/habits')({
  loader: ({ context }) => context.queryClient.ensureQueryData(habitsQuery(false)),
  component: HabitsPage,
});

function HabitsPage() {
  const { data: me } = useQuery(meQuery);
  const { data: habits } = useQuery(habitsQuery(false));
  const [showArchived, setShowArchived] = useState(false);
  const { data: archived = [] } = useQuery({ ...habitsQuery(true), enabled: showArchived });
  if (!me || !habits) return null;

  const today = habits.filter((h) => h.dueToday);
  const rest = habits.filter((h) => !h.dueToday);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Habits"
        description="Small things on a schedule. Check in here or on Today; a forgotten one can be checked in the next day."
        actions={
          <Button onClick={() => newHabit()}>
            <Plus /> New habit
          </Button>
        }
      />

      {habits.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Repeat className="mx-auto mb-2 size-6 text-emerald-500" />
          No habits yet. Start with one small enough to do on a bad day.
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => newHabit()}>
              <Plus /> New habit
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Section title="Today" habits={today} today={me.today} />
          <Section title="Not today" habits={rest} today={me.today} />
        </>
      )}

      <div>
        <button
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowArchived((s) => !s)}
        >
          <ChevronRight
            className={cn('size-3.5 transition-transform', showArchived && 'rotate-90')}
          />
          Archived
        </button>
        {showArchived &&
          (archived.length ? (
            <div className="mt-2 rounded-xl border bg-card p-1">
              {archived.map((h) => (
                <HabitRow key={h.id} habit={h} today={me.today} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Nothing archived.</p>
          ))}
      </div>
    </div>
  );
}

function Section({ title, habits, today }: { title: string; habits: Habit[]; today: string }) {
  if (!habits.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="rounded-xl border bg-card p-1">
        {habits.map((h) => (
          <HabitRow key={h.id} habit={h} today={today} />
        ))}
      </div>
    </section>
  );
}
