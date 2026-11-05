// A commitment goal's progress (D40): focus on its project this week or month, a bar with a tick
// where an even pace would be, the minutes a day still needed, and the streak of periods met.
// Compact on the goals panel; with the last periods in the goal sheet.

import type { CommitmentProgress as Progress, GoalPeriod } from '@strekatron/shared/structure';
import { formatMinutes } from '@/lib/days';
import { cn } from '@/lib/utils';

const PERIOD = { week: 'this week', month: 'this month' } as const;
const PLURAL = { week: 'weeks', month: 'months' } as const;

/** What the pace means, in words. */
function paceLine(p: Progress, period: GoalPeriod): string {
  switch (p.pace) {
    case 'done':
      return `Target met ${PERIOD[period]}`;
    case 'ended':
      return 'This goal has ended';
    default: {
      const daily = `${formatMinutes(p.perDay)} a day to go`;
      if (p.daysLeft === 1) return `${formatMinutes(p.target - p.minutes)} left today`;
      return p.pace === 'behind' ? `Behind · ${daily}` : `On track · ${daily}`;
    }
  }
}

export function CommitmentProgress({
  progress: p,
  period,
  detailed = false,
}: {
  progress: Progress;
  period: GoalPeriod;
  detailed?: boolean;
}) {
  const pct = Math.min(100, Math.round((p.minutes / p.target) * 100));
  const tick = Math.min(100, Math.round((p.expected / p.target) * 100));
  const tone =
    p.pace === 'done'
      ? 'bg-emerald-500'
      : p.pace === 'behind'
        ? 'bg-amber-500'
        : p.pace === 'ended'
          ? 'bg-muted-foreground/50'
          : 'bg-primary';

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span>
          <span className="font-medium text-foreground">{formatMinutes(p.minutes)}</span>
          <span className="text-muted-foreground">
            {' '}
            of {formatMinutes(p.target)} {p.pace === 'ended' ? '' : PERIOD[period]}
          </span>
        </span>
        {p.streak > 1 && (
          <span className="text-muted-foreground" title="Periods in a row with the target met">
            {p.streak} {PLURAL[period]} in a row
          </span>
        )}
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={p.target}
        aria-valuenow={Math.min(p.minutes, p.target)}
        aria-label={`Focus ${PERIOD[period]}`}
      >
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
        {p.pace !== 'done' && p.pace !== 'ended' && tick > 0 && tick < 100 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/40"
            style={{ left: `${tick}%` }}
            title="Where an even pace would be by today"
          />
        )}
      </div>
      <p
        className={cn(
          'text-xs',
          p.pace === 'behind'
            ? 'text-amber-600 dark:text-amber-400'
            : p.pace === 'done'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground',
        )}
      >
        {paceLine(p, period)}
      </p>
      {detailed && p.history.length > 0 && (
        <div className="mt-1 grid gap-1">
          <span className="text-xs text-muted-foreground">Last {PLURAL[period]}</span>
          <div className="flex gap-1.5">
            {p.history.map((h) => (
              <span
                key={h.start}
                title={`${period === 'week' ? 'Week of' : ''} ${h.start}: ${formatMinutes(h.minutes)}`}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs tabular-nums',
                  h.met
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'text-muted-foreground',
                )}
              >
                {formatMinutes(h.minutes)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
