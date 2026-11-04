// The quest board on Today: today's quests, this week's, and follow-ups. Each shows its progress;
// most can be rerolled once.

import { QUEST_TYPE_LABELS, type QuestType } from '@streaktron/shared/game';
import { useQuery } from '@tanstack/react-query';
import { Check, Dices, Swords } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGameActions } from '@/lib/actions';
import { formatMinutes } from '@/lib/days';
import { questsQuery, type Quest } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ORDER: QuestType[] = ['comeback', 'follow_up', 'daily', 'time', 'make', 'quick', 'weekly'];

export function QuestBoard() {
  const { data: quests, isPending } = useQuery(questsQuery);
  if (isPending) return <div className="h-40 animate-pulse rounded-xl bg-muted/60" />;
  const list = [...(quests ?? [])].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const today = list.filter((q) => q.period !== 'week');
  const week = list.filter((q) => q.period === 'week');
  const daily = list.filter((q) => q.type === 'daily');
  const dailyDone = daily.filter((q) => q.status === 'completed').length;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Swords className="size-4 text-primary" /> Quests
        </h2>
        {daily.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {dailyDone === daily.length
              ? 'Board cleared: bonus earned'
              : `${dailyDone}/${daily.length} daily · clear them all for a bonus`}
          </span>
        )}
      </div>
      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No quests right now. Add a project with a few tasks and they’ll start coming.
        </p>
      )}
      {today.length > 0 && <QuestList quests={today} />}
      {week.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            This week
          </h3>
          <QuestList quests={week} />
        </div>
      )}
    </section>
  );
}

function QuestList({ quests }: { quests: Quest[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {quests.map((q) => (
        <QuestRow key={q.id} quest={q} />
      ))}
    </ul>
  );
}

const isMinutes = (q: Quest) => q.templateKey.startsWith('time.');

function QuestRow({ quest: q }: { quest: Quest }) {
  const actions = useGameActions();
  const [busy, setBusy] = useState(false);
  const done = q.status === 'completed';
  // Light up when it turns done while on screen (not when the board loads already done).
  const wasDone = useRef(done);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (done && !wasDone.current) {
      const on = setTimeout(() => setJustDone(true), 0);
      const off = setTimeout(() => setJustDone(false), 1700);
      wasDone.current = true;
      return () => {
        clearTimeout(on);
        clearTimeout(off);
      };
    }
    wasDone.current = done;
  }, [done]);
  const pct = Math.min(100, (q.progress / q.target) * 100);
  const progress = isMinutes(q)
    ? `${formatMinutes(q.progress)} / ${formatMinutes(q.target)}`
    : q.target > 1
      ? `${q.progress}/${q.target}`
      : null;

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', justDone && 'animate-quest-done')}>
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full border-2',
          done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
        )}
        aria-label={done ? 'Done' : 'Open'}
      >
        {done && <Check className="size-3.5 stroke-[3]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm leading-5', done && 'text-muted-foreground line-through')}>
          {q.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-px font-medium">
            {QUEST_TYPE_LABELS[q.type]}
          </span>
          <span className="tabular-nums">+{q.xp} XP</span>
          {progress && <span className="tabular-nums">{progress}</span>}
          {q.type === 'follow_up' && !done && <span>until tomorrow</span>}
        </div>
        {!done && q.target > 1 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {q.canReroll && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Reroll “${q.title}”`}
          title="Swap for another (once)"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await actions.reroll(q.id);
            setBusy(false);
          }}
        >
          <Dices />
        </Button>
      )}
    </li>
  );
}
