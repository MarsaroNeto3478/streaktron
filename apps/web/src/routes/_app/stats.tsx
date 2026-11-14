// Stats (plan.md Phase 6, D50): where the time went. Totals for a range of weeks against the weeks
// before, a weekly trend, focus per project and area, how quests went, the streak's history, and
// the heatmap. One hue throughout: every chart shows one measure, so color carries no identity.

import { addDays, startOfWeek } from '@strekatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowDownRight, ArrowUpRight, Flame } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { PageSkeleton } from '@/components/page-states';
import { formatDayShort, formatMinutes } from '@/lib/days';
import { COLOR } from '@/lib/look';
import {
  heatmapQuery,
  meQuery,
  statsQuery,
  type HeatDay,
  type StatsOverview,
  type StatsWeeks,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/stats')({
  component: StatsPage,
});

const WEEKS = 26;

const RANGES: { value: StatsWeeks; label: string }[] = [
  { value: '4', label: '4 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '6 months' },
  { value: '52', label: 'A year' },
];

type Metric = 'focusMinutes' | 'tasks' | 'xp' | 'activeDays';
const METRICS: Record<Metric, { label: string; format: (n: number) => string }> = {
  focusMinutes: { label: 'Focus', format: (n) => (n === 0 ? '0' : formatMinutes(n)) },
  tasks: { label: 'Tasks done', format: (n) => n.toLocaleString('en') },
  xp: { label: 'XP', format: (n) => n.toLocaleString('en') },
  activeDays: { label: 'Active days', format: (n) => String(n) },
};

const QUEST_NAMES: Record<string, string> = {
  quick: 'Quick',
  daily: 'Daily',
  time: 'Time',
  make: 'Make',
  follow_up: 'Follow-up',
  weekly: 'Weekly',
  review: 'Review',
  project: 'Project',
  comeback: 'Comeback',
};

const monthDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDay = (d: string) => monthDay.format(new Date(`${d}T12:00:00Z`));

/** A round top for an axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function StatsPage() {
  const { data: me } = useQuery(meQuery);
  const [weeks, setWeeks] = useState<StatsWeeks>('12');
  const { data, isPending } = useQuery(statsQuery(weeks));
  if (!me) return <PageSkeleton className="max-w-4xl" />;
  const range = RANGES.find((r) => r.value === weeks)!;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Stats"
        description="Where your time went."
        actions={
          <div
            role="radiogroup"
            aria-label="Range"
            className="flex rounded-lg border bg-card p-0.5 text-sm"
          >
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="radio"
                aria-checked={weeks === r.value}
                onClick={() => setWeeks(r.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground',
                  weeks === r.value && 'bg-accent text-accent-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      {data ? (
        <div className={cn('space-y-6', isPending && 'opacity-60')}>
          <Tiles data={data} range={range.label} />
          <Trend data={data} />
          <div className="grid gap-6 md:grid-cols-2">
            <FocusSplit data={data} />
            <QuestOutcomes data={data} />
          </div>
          <Streaks data={data} />
        </div>
      ) : (
        <div className="h-96 animate-pulse rounded-xl bg-muted/60" />
      )}
      <Heatmap today={me.today} weekStart={me.settings.weekStart} />
    </div>
  );
}

function Card({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Tiles({ data, range }: { data: StatsOverview; range: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {(Object.keys(METRICS) as Metric[]).map((m) => {
        const now = data.totals[m];
        const before = data.previous[m];
        const delta = before > 0 ? Math.round(((now - before) / before) * 100) : null;
        return (
          <div key={m} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{METRICS[m].label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{METRICS[m].format(now)}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {delta === null ? (
                `in the last ${range.toLowerCase()}`
              ) : (
                <>
                  {delta >= 0 ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                  <span className="tabular-nums">
                    {delta >= 0 ? '+' : '−'}
                    {Math.abs(delta)}%
                  </span>
                  vs. the {range.toLowerCase()} before
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Trend({ data }: { data: StatsOverview }) {
  const [metric, setMetric] = useState<Metric>('focusMinutes');
  const [hover, setHover] = useState<number | null>(null);
  const { format, label } = METRICS[metric];
  const values = data.weeks.map((w) => w[metric]);
  const top =
    metric === 'focusMinutes'
      ? niceMax(Math.max(...values) / 60) * 60
      : niceMax(Math.max(...values));
  const every = Math.ceil(data.weeks.length / 6);
  const h = hover !== null ? data.weeks[hover] : null;

  return (
    <Card
      title="Week by week"
      aside={
        <div role="radiogroup" aria-label="Measure" className="flex flex-wrap gap-1 text-xs">
          {(Object.keys(METRICS) as Metric[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 font-medium text-muted-foreground hover:text-foreground',
                metric === m && 'border-primary bg-primary/10 text-foreground',
              )}
            >
              {METRICS[m].label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex gap-2">
        {/* Axis: the top and the middle, in the measure's own units. */}
        <div className="flex h-40 flex-col justify-between pb-0 text-right text-[10px] text-muted-foreground tabular-nums">
          <span className="-translate-y-1/2">{format(top)}</span>
          <span>{format(top / 2)}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <span className="border-t border-dashed border-border/70" />
            <span className="border-t border-dashed border-border/70" />
            <span className="border-t border-border" />
          </div>
          <div className="relative flex h-40 items-end" onMouseLeave={() => setHover(null)}>
            {data.weeks.map((w, i) => (
              <button
                key={w.start}
                type="button"
                className="group flex h-full flex-1 items-end justify-center px-px focus-visible:outline-none"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`Week of ${fmtDay(w.start)}: ${format(w[metric])}`}
              >
                <span
                  className={cn(
                    'block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity',
                    hover !== null && hover !== i && 'opacity-50',
                    'group-focus-visible:ring-2 group-focus-visible:ring-ring',
                  )}
                  style={{ height: `${(w[metric] / top) * 100}%`, minHeight: w[metric] ? 2 : 0 }}
                />
              </button>
            ))}
            {h && hover !== null && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md"
                style={{ left: `${((hover + 0.5) / data.weeks.length) * 100}%` }}
              >
                <strong className="tabular-nums">{format(h[metric])}</strong>{' '}
                <span className="text-muted-foreground">· week of {fmtDay(h.start)}</span>
              </div>
            )}
          </div>
          <div className="mt-1 flex text-[10px] text-muted-foreground">
            {data.weeks.map((w, i) => (
              <span key={w.start} className="flex-1 text-center">
                {i % every === 0 ? fmtDay(w.start) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{label} per week</caption>
        <thead>
          <tr>
            <th>Week of</th>
            <th>{label}</th>
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((w) => (
            <tr key={w.start}>
              <td>{fmtDay(w.start)}</td>
              <td>{format(w[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** A labeled horizontal bar: name, bar, value at the tip. */
function BarRow({
  label,
  dot,
  value,
  share,
  text,
}: {
  label: string;
  dot?: string | null;
  value: string;
  /** 0–1 of the longest bar. */
  share: number;
  text?: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
        <span className="truncate" title={label}>
          {label}
        </span>
      </span>
      <span className="h-2.5 rounded-r-[4px] bg-muted">
        <span
          className="block h-full rounded-r-[4px] bg-primary"
          style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
        />
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {value}
        {text && <span className="ml-1">{text}</span>}
      </span>
    </li>
  );
}

function FocusSplit({ data }: { data: StatsOverview }) {
  const [by, setBy] = useState<'project' | 'area'>('project');
  const rows =
    by === 'project'
      ? data.focusByProject.map((p) => ({ key: p.projectId ?? 'none', ...p }))
      : data.focusByArea.map((a) => ({ key: a.areaId ?? 'none', ...a }));
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + r.minutes, 0);
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <Card
      title="Focus"
      aside={
        <div role="radiogroup" aria-label="Group by" className="flex gap-1 text-xs">
          {(['project', 'area'] as const).map((b) => (
            <button
              key={b}
              role="radio"
              aria-checked={by === b}
              onClick={() => setBy(b)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 font-medium text-muted-foreground hover:text-foreground',
                by === b && 'border-primary bg-primary/10 text-foreground',
              )}
            >
              By {b}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No focus sessions in these weeks.</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <BarRow
              key={r.key}
              label={r.title}
              dot={r.color ? COLOR[r.color].dot : null}
              value={formatMinutes(r.minutes)}
              share={r.minutes / max}
            />
          ))}
          {rest > 0 && (
            <BarRow label="Everything else" value={formatMinutes(rest)} share={rest / max} />
          )}
        </ul>
      )}
    </Card>
  );
}

function QuestOutcomes({ data }: { data: StatsOverview }) {
  const done = data.quests.reduce((s, q) => s + q.completed, 0);
  const all = data.quests.reduce((s, q) => s + q.completed + q.expired, 0);
  return (
    <Card
      title="Quests"
      aside={
        all > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {done} of {all} done · {Math.round((done / all) * 100)}%
          </span>
        )
      }
    >
      {all === 0 ? (
        <p className="text-sm text-muted-foreground">No quests have ended in these weeks yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.quests.map((q) => {
            const n = q.completed + q.expired;
            return (
              <BarRow
                key={q.type}
                label={QUEST_NAMES[q.type] ?? q.type}
                value={`${Math.round((q.completed / n) * 100)}%`}
                text={`(${q.completed}/${n})`}
                share={q.completed / n}
              />
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Done vs. let expire, for quests whose time is over (rerolled ones don’t count).
      </p>
    </Card>
  );
}

function Streaks({ data }: { data: StatsOverview }) {
  const runs = data.streaks.slice(0, 6);
  const longest = Math.max(1, ...data.streaks.map((r) => r.days));
  const current = data.streaks.find((r) => r.current);
  return (
    <Card
      title="Streak history"
      aside={
        <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Flame className="size-3.5" />
          {current ? `${current.days} days now` : 'No streak right now'} · longest{' '}
          {data.streaks[0]?.days ?? 0}
        </span>
      }
    >
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Two active days in a row start a streak. Your runs will show here.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {runs.map((r) => (
            <BarRow
              key={r.start}
              label={`${fmtDay(r.start)} – ${r.current ? 'now' : fmtDay(r.end)}`}
              value={`${r.days} days`}
              share={r.days / longest}
            />
          ))}
        </ul>
      )}
    </Card>
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
