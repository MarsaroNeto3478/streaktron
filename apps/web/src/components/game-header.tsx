// Level, XP and streaks: a compact chip in the top bar, and the full header on Today.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarCheck, Flame, Snowflake } from 'lucide-react';
import { gameStateQuery, meQuery, type GameStateView } from '@/lib/queries';
import { STREAK_RULE } from '@/lib/game';
import { cn } from '@/lib/utils';

export function GameChip() {
  const { data: g } = useQuery(gameStateQuery);
  if (!g) return null;
  return (
    <Link
      to="/today"
      className="mr-1 flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums hover:bg-muted"
      aria-label={`Level ${g.level.level}, ${g.daily.current}-day streak`}
    >
      <span>Lv {g.level.level}</span>
      <span
        className={cn(
          'flex items-center gap-0.5',
          g.daily.activeToday ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Flame className="size-3.5" />
        {g.daily.current}
      </span>
    </Link>
  );
}

export function GameHeader() {
  const { data: g } = useQuery(gameStateQuery);
  const { data: me } = useQuery(meQuery);
  if (!g) return <div className="h-[104px] animate-pulse rounded-xl bg-muted/60" />;
  // When a missed day is what makes the user drop things, the forgiving weekly streak leads (D36).
  const weekFirst = me?.settings.challenge === 'missed_day';
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Level g={g} />
      {weekFirst ? <WeekTarget g={g} /> : <DailyStreak g={g} />}
      {weekFirst ? <DailyStreak g={g} /> : <WeekTarget g={g} />}
    </div>
  );
}

function Stat({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border bg-card p-4', className)}>{children}</div>;
}

function Level({ g }: { g: GameStateView }) {
  const pct = (g.level.into / g.level.span) * 100;
  return (
    <Stat>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Level {g.level.level}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {g.level.into} / {g.level.span} XP
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={g.level.into}
        aria-valuemax={g.level.span}
        aria-label="XP to the next level"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {g.xpToday > 0 ? `+${g.xpToday} XP today` : `${g.xp} XP in all`}
      </p>
    </Stat>
  );
}

function DailyStreak({ g }: { g: GameStateView }) {
  const d = g.daily;
  return (
    <Stat>
      <div className="flex items-center gap-2">
        <Flame className={cn('size-5', d.activeToday ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-2xl font-bold tabular-nums">{d.current}</span>
        <span className="text-sm text-muted-foreground">day{d.current === 1 ? '' : 's'}</span>
        <span
          className="ml-auto flex items-center gap-1 text-xs text-sky-600 tabular-nums dark:text-sky-400"
          title="Streak freezes: a missed day uses one"
        >
          {Array.from({ length: 2 }, (_, i) => (
            <Snowflake key={i} className={cn('size-3.5', i >= d.freezes && 'opacity-25')} />
          ))}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {d.activeToday
          ? 'Today counts. Nice.'
          : d.atRisk
            ? `${STREAK_RULE} today to keep it.`
            : d.current > 0
              ? `${STREAK_RULE} to keep it. A freeze covers today if you need it.`
              : `${STREAK_RULE} to start one.`}
      </p>
    </Stat>
  );
}

function WeekTarget({ g }: { g: GameStateView }) {
  const w = g.weekly;
  return (
    <Stat>
      <div className="flex items-center gap-2">
        <CalendarCheck
          className={cn('size-5', w.week.met ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className="text-sm font-semibold">This week</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {w.current} week{w.current === 1 ? '' : 's'} in a row
        </span>
      </div>
      <div
        className="mt-3 flex gap-1"
        aria-label={`${w.week.activeDays} of ${w.week.target} active days`}
      >
        {Array.from({ length: Math.max(w.week.target, w.week.activeDays) }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 flex-1 rounded-full',
              i < w.week.activeDays ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {w.week.met ? 'Weekly target met.' : `${w.week.activeDays} of ${w.week.target} active days`}
      </p>
    </Stat>
  );
}
