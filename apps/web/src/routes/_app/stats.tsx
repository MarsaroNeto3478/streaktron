import { addDays, startOfWeek } from '@strekatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { GameHeader } from '@/components/game-header';
import { PageHeader } from '@/components/page-header';
import { formatDayShort, formatMinutes } from '@/lib/days';
import { heatmapQuery, meQuery, type HeatDay } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/stats')({
  component: StatsPage,
});

const WEEKS = 26;

function StatsPage() {
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Stats"
        description="Where your days went. More charts come after a few weeks of use."
      />
      <GameHeader />
      <Heatmap today={me.today} weekStart={me.settings.weekStart} />
    </div>
  );
}

/** Intensity 0–4: inactive, active, then by focus minutes. */
function level(d: HeatDay | undefined): number {
  if (!d || !d.active) return d && (d.focusMinutes > 0 || d.tasks > 0) ? 1 : 0;
  if (d.focusMinutes >= 120) return 4;
  if (d.focusMinutes >= 60) return 3;
  if (d.focusMinutes >= 25) return 2;
  return 1;
}

const SHADES = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Heatmap({ today, weekStart }: { today: string; weekStart: number }) {
  const first = addDays(startOfWeek(today, weekStart), -7 * (WEEKS - 1));
  const { data: days = [], isPending } = useQuery(heatmapQuery(first, today));
  const byDay = new Map(days.map((d) => [d.date, d]));
  const activeDays = days.filter((d) => d.active).length;
  const focus = days.reduce((s, d) => s + d.focusMinutes, 0);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Last {WEEKS} weeks</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {activeDays} active day{activeDays === 1 ? '' : 's'} · {formatMinutes(focus)} of focus
        </span>
      </div>
      <div className={cn('flex gap-2 overflow-x-auto pb-1', isPending && 'opacity-50')}>
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pr-1 text-[10px] leading-3 text-muted-foreground">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={cn('h-3', i % 2 === 1 && 'invisible')}>
              {WEEKDAY[(weekStart + i) % 7]}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
          {Array.from({ length: WEEKS * 7 }, (_, i) => {
            const day = addDays(first, i);
            if (day > today) return <span key={day} className="size-3" />;
            const d = byDay.get(day);
            const label = d
              ? `${formatDayShort(day, today)}: ${d.active ? 'active' : 'not active'}, ${formatMinutes(d.focusMinutes)} focus, ${d.tasks} task${d.tasks === 1 ? '' : 's'}, ${d.xp} XP`
              : `${formatDayShort(day, today)}: nothing`;
            return (
              <span
                key={day}
                title={label}
                aria-label={label}
                className={cn(
                  'size-3 rounded-[3px]',
                  SHADES[level(d)],
                  day === today && 'ring-1 ring-foreground/40',
                )}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        Less
        {SHADES.map((s) => (
          <span key={s} className={cn('size-3 rounded-[3px]', s)} />
        ))}
        More
      </div>
    </section>
  );
}
