// Medals and prizes (D49): medals mark steady effort, prizes mark milestones (streaks, finished
// projects). Each group shows its steps: earned ones with their day, the next with its progress.
// In the bedroom (Phase 7) they go on the wardrobe.

import type { AchievementGroup } from '@strekatron/shared/game';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  Flame,
  Lock,
  Repeat,
  RotateCcw,
  Sparkles,
  Star,
  Swords,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatDayLong } from '@/lib/days';
import { achievementsQuery, type Achievement } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/medals')({
  component: MedalsPage,
});

const GROUPS: Record<AchievementGroup, { title: string; icon: LucideIcon }> = {
  daily_streak: { title: 'Daily streak', icon: Flame },
  weekly_streak: { title: 'Weekly target', icon: CalendarCheck },
  tasks: { title: 'Tasks', icon: CheckCircle2 },
  focus: { title: 'Focus', icon: Timer },
  reviews: { title: 'Weekly reviews', icon: ClipboardCheck },
  quests: { title: 'Quests', icon: Swords },
  sweeps: { title: 'Clean sweeps', icon: Sparkles },
  habits: { title: 'Habits', icon: Repeat },
  comeback: { title: 'Comebacks', icon: RotateCcw },
  level: { title: 'Levels', icon: Star },
};

/** Bronze, silver, gold, platinum, diamond. */
const TIER = [
  'bg-amber-700/15 text-amber-800 dark:text-amber-500 border-amber-700/40',
  'bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/50',
  'bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/50',
  'bg-cyan-400/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/50',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/50',
];

function MedalsPage() {
  const { data } = useQuery(achievementsQuery);
  if (!data) return <div className="mx-auto h-64 max-w-4xl animate-pulse rounded-xl bg-muted/60" />;
  const all = data.achievements;
  const medals = all.filter((a) => a.kind === 'medal');
  const prizes = all.filter((a) => a.kind === 'prize');
  const count = (list: Achievement[]) => list.filter((a) => a.earnedOn).length;
  const groups = (list: Achievement[]) =>
    [...new Set(list.map((a) => a.group))].map((g) => list.filter((a) => a.group === g));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Medals & prizes"
        description="Medals mark steady effort; prizes mark milestones. Later they’ll go on your bedroom’s wardrobe."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Summary
          icon={Trophy}
          label="Prizes"
          value={`${count(prizes) + data.projectPrizes.length}`}
          hint={`${count(prizes)} of ${prizes.length} milestones · ${data.projectPrizes.length} projects finished`}
        />
        <Summary
          icon={Star}
          label="Medals"
          value={`${count(medals)} / ${medals.length}`}
          hint="Earned once, kept for good"
        />
      </div>

      <section aria-label="Prizes" className="space-y-3">
        <h2 className="text-lg font-semibold">Prizes</h2>
        {groups(prizes).map((g) => (
          <GroupRow key={g[0]!.group} steps={g} />
        ))}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Flag className="size-4" /> Finished projects
          </div>
          {data.projectPrizes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Complete a project to win its prize.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {data.projectPrizes.map((p) => (
                <li key={p.key}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.projectId }}
                    className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-400/15 px-3 py-1.5 text-sm hover:bg-yellow-400/25"
                    title={`Finished on ${formatDayLong(p.earnedOn)}`}
                  >
                    <Trophy className="size-4 text-yellow-600 dark:text-yellow-400" />
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-label="Medals" className="space-y-3">
        <h2 className="text-lg font-semibold">Medals</h2>
        {groups(medals).map((g) => (
          <GroupRow key={g[0]!.group} steps={g} />
        ))}
      </section>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/** One group's steps: earned, the next one with its progress, then the rest locked. */
function GroupRow({ steps }: { steps: Achievement[] }) {
  const { title, icon: Icon } = GROUPS[steps[0]!.group];
  const next = steps.find((s) => !s.earnedOn);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" /> {title}
        </span>
        {next && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.min(next.value, next.target)} / {next.target} {next.unit}
          </span>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((s) => (
          <Step key={s.key} s={s} isNext={s === next} />
        ))}
      </ul>
    </div>
  );
}

function Step({ s, isNext }: { s: Achievement; isNext: boolean }) {
  const earned = !!s.earnedOn;
  const pct = Math.min(100, Math.round((s.value / s.target) * 100));
  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-2.5',
        earned ? TIER[Math.min(s.tier, TIER.length) - 1] : 'border-dashed',
        !earned && !isNext && 'opacity-50',
      )}
      title={s.description}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {!earned && !isNext && <Lock className="size-3.5 shrink-0" />}
        <span className="line-clamp-1">{s.title}</span>
      </span>
      <span className={cn('text-xs', earned ? 'opacity-80' : 'text-muted-foreground')}>
        {earned ? formatDayLong(s.earnedOn!) : s.description}
      </span>
      {isNext && (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={s.value}
          aria-valuemax={s.target}
          aria-label={`${s.title} progress`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
    </li>
  );
}
