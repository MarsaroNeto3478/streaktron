import {
  CHALLENGE_TEXT,
  CHALLENGES,
  QUEST_TYPE_LABELS,
  RESTABLE_TYPES,
  type Challenge,
} from '@strekatron/shared/game';
import { DAY_SETTINGS_LOCK_DAYS, type SettingsPatch } from '@strekatron/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FolderKanban, Plus, Shapes, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Streaky } from '@/components/streaky';
import { useGameActions, useStructureActions, useTutorialActions } from '@/lib/actions';
import { errorMessage } from '@/lib/api';
import { meQuery, projectsQuery, snapshotsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function SettingsPage() {
  const { data: me } = useQuery(meQuery);
  // The forms start from the saved values; remount them when those change.
  const key = me ? JSON.stringify(me.settings) : 'loading';
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Your day, your week, focus and quests." />
      <DaySettings key={`day-${key}`} />
      <WeekSettings key={`week-${key}`} />
      <FocusPresets key={`focus-${key}`} />
      <QuestSettings key={`quests-${key}`} />
      <StreakySettings key={`streaky-${key}`} />
      <ProjectLimit key={`limit-${key}`} />
      <DeletedItems />
    </div>
  );
}

// --- Day, week, focus and quests -------------------------------------------------------------

/** A settings card with its own form: saves `patch()` and shows the server's message on failure. */
function SettingsCard({
  title,
  description,
  children,
  patch,
  dirty,
  valid = true,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  patch: () => SettingsPatch;
  dirty: boolean;
  valid?: boolean;
}) {
  const actions = useGameActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await actions.saveSettings(patch());
      toast.success('Saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          {children}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !dirty || !valid}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
})();

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function DaySettings() {
  const { data: me } = useQuery(meQuery);
  const s = me?.settings;
  const [timezone, setTimezone] = useState(s?.timezone ?? 'UTC');
  const [hour, setHour] = useState(String(s?.dayStartHour ?? 4));
  if (!s) return null;
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lockedUntil = s.timezoneChangedAt
    ? new Date(new Date(s.timezoneChangedAt).getTime() + DAY_SETTINGS_LOCK_DAYS * 86_400_000)
    : null;
  const locked = !!lockedUntil && lockedUntil > new Date();

  return (
    <SettingsCard
      title="Your day"
      description={
        <>
          Which day things count for: work before the day start counts for the day before. These
          change at most once a week, so streaks stay honest
          {locked && lockedUntil && <> (next change: {dateTime.format(lockedUntil)})</>}.
        </>
      }
      dirty={timezone !== s.timezone || Number(hour) !== s.dayStartHour}
      valid={ZONES.length === 0 || ZONES.includes(timezone) || timezone === 'UTC'}
      patch={() => ({ timezone, dayStartHour: Number(hour) })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="tz">Time zone</Label>
          <Input
            id="tz"
            list="tz-list"
            value={timezone}
            disabled={locked}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id="tz-list">
            {ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          {here !== timezone && !locked && (
            <button
              type="button"
              className="w-fit text-xs text-primary hover:underline"
              onClick={() => setTimezone(here)}
            >
              Use this device’s ({here})
            </button>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label>Day starts at</Label>
          <Select value={hour} onValueChange={setHour} disabled={locked}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsCard>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WeekSettings() {
  const { data: me } = useQuery(meQuery);
  const s = me?.settings;
  const [weekStart, setWeekStart] = useState(String(s?.weekStart ?? 1));
  const [target, setTarget] = useState(String(s?.weeklyActiveDayTarget ?? 4));
  if (!s) return null;
  return (
    <SettingsCard
      title="Your week"
      description="The weekly streak grows each week you’re active on at least this many days. It forgives missed days, so it’s the one to watch."
      dirty={Number(weekStart) !== s.weekStart || Number(target) !== s.weeklyActiveDayTarget}
      patch={() => ({ weekStart: Number(weekStart), weeklyActiveDayTarget: Number(target) })}
    >
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label>Week starts on</Label>
          <Select value={weekStart} onValueChange={setWeekStart}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Active days a week</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsCard>
  );
}

type Preset = { focusMinutes: number; breakMinutes: number };

function FocusPresets() {
  const { data: me } = useQuery(meQuery);
  const saved = me?.settings.focusPresets;
  const [presets, setPresets] = useState<Preset[]>(saved ?? []);
  if (!saved) return null;
  const valid =
    presets.length >= 1 &&
    presets.every(
      (p) =>
        Number.isInteger(p.focusMinutes) &&
        p.focusMinutes >= 1 &&
        p.focusMinutes <= 240 &&
        Number.isInteger(p.breakMinutes) &&
        p.breakMinutes >= 0 &&
        p.breakMinutes <= 60,
    );
  const set = (i: number, patch: Partial<Preset>) =>
    setPresets((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <SettingsCard
      title="Focus presets"
      description="The lengths offered when you start a focus session. Sessions earn 1 XP a minute from 10 minutes on."
      dirty={JSON.stringify(presets) !== JSON.stringify(saved)}
      valid={valid}
      patch={() => ({ focusPresets: presets })}
    >
      <ul className="space-y-2">
        {presets.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <Input
              aria-label="Focus minutes"
              type="number"
              min={1}
              max={240}
              className="w-20"
              value={p.focusMinutes}
              onChange={(e) => set(i, { focusMinutes: Number(e.target.value) })}
            />
            min focus,
            <Input
              aria-label="Break minutes"
              type="number"
              min={0}
              max={60}
              className="w-20"
              value={p.breakMinutes}
              onChange={(e) => set(i, { breakMinutes: Number(e.target.value) })}
            />
            min break
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Remove preset"
              disabled={presets.length === 1}
              onClick={() => setPresets((ps) => ps.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {presets.length < 6 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPresets((ps) => [...ps, { focusMinutes: 90, breakMinutes: 15 }])}
        >
          <Plus /> Preset
        </Button>
      )}
    </SettingsCard>
  );
}

type Restable = (typeof RESTABLE_TYPES)[number];

const QUEST_HELP: Record<Restable, string> = {
  quick: 'Small chores under 5 minutes: triage, pick a next action',
  daily: 'Three a day from your projects and tasks',
  time: 'Focus time, sized from your own recent days',
  make: 'Add a task or goal, then fill in its details',
  weekly: 'Your weekly target, and working on every active project',
  review: 'Do the weekly review, and revisit a parked project',
};

function QuestSettings() {
  const { data: me } = useQuery(meQuery);
  const q = me?.settings.questSettings;
  const [resting, setResting] = useState<Restable[]>((q?.restingTypes ?? []) as Restable[]);
  const [min, setMin] = useState(String(q?.timeQuestMinMinutes ?? 15));
  const [max, setMax] = useState(String(q?.timeQuestMaxMinutes ?? 180));
  if (!q) return null;
  const lo = Number(min);
  const hi = Number(max);
  const valid = Number.isInteger(lo) && Number.isInteger(hi) && lo >= 5 && hi <= 600 && lo <= hi;

  return (
    <SettingsCard
      title="Quests"
      description="Turn off the kinds that don’t fit how you work (the comeback quest always stays). Changes show on the next board."
      dirty={
        JSON.stringify([...resting].sort()) !== JSON.stringify([...q.restingTypes].sort()) ||
        lo !== q.timeQuestMinMinutes ||
        hi !== q.timeQuestMaxMinutes
      }
      valid={valid}
      patch={() => ({
        questSettings: { restingTypes: resting, timeQuestMinMinutes: lo, timeQuestMaxMinutes: hi },
      })}
    >
      <ul className="space-y-2">
        {RESTABLE_TYPES.map((t) => (
          <li key={t}>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={!resting.includes(t)}
                onCheckedChange={(on) =>
                  setResting((r) => (on ? r.filter((x) => x !== t) : [...r, t]))
                }
              />
              <span>
                <span className="font-medium">{QUEST_TYPE_LABELS[t]}</span>
                <span className="block text-xs text-muted-foreground">{QUEST_HELP[t]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="grid gap-1.5">
          <Label htmlFor="tq-min">Time quests: at least</Label>
          <Input
            id="tq-min"
            type="number"
            min={5}
            max={600}
            className="w-24"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tq-max">at most (minutes)</Label>
          <Input
            id="tq-max"
            type="number"
            min={5}
            max={600}
            className="w-24"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

// --- Streaky: the challenge and the tour (D31, D32, D36) --------------------------------------

const NONE = 'none';

function StreakySettings() {
  const { data: me } = useQuery(meQuery);
  const tour = useTutorialActions();
  const navigate = useNavigate();
  const saved = me?.settings.challenge ?? null;
  const [value, setValue] = useState<string>(saved ?? NONE);
  const challenge = value === NONE ? null : (value as Challenge);

  return (
    <SettingsCard
      title="Streaky"
      description="Your biggest challenge with discipline tunes the app a little. Streaky’s tour shows you around."
      dirty={challenge !== saved}
      patch={() => ({ challenge })}
    >
      <div className="flex items-start gap-3">
        <Streaky mood="thinking" size={56} />
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="challenge">Biggest challenge</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="challenge" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {CHALLENGES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHALLENGE_TEXT[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {challenge ? CHALLENGE_TEXT[challenge].tuning : 'Nothing is tuned.'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">
          Take the tour again from Today. Steps you were rewarded for once don’t reward again.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (await tour.start()) void navigate({ to: '/today' });
          }}
        >
          Take the tour
        </Button>
      </div>
    </SettingsCard>
  );
}

// --- Projects and deleted items --------------------------------------------------------------

function ProjectLimit() {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const actions = useStructureActions();
  const current = me?.settings.activeProjectLimit ?? 3;
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 20;
  const active = projects.filter((p) => p.status === 'active').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active projects</CardTitle>
        <CardDescription>
          How many projects can be active at once. Activating one more asks you to park another;
          fewer active projects means each one actually moves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form
          className="flex items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            await actions.updateSettings(n);
            setBusy(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="limit">Limit</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={20}
              className="w-24"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !valid || n === current}>
            Save
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {active} active now.
          {valid &&
            n < active &&
            ' Lowering it keeps them active; you just can’t add more until you’re under it.'}
        </p>
      </CardContent>
    </Card>
  );
}

function DeletedItems() {
  const { data: snapshots = [], isPending } = useQuery(snapshotsQuery);
  const actions = useStructureActions();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deleted projects and areas</CardTitle>
        <CardDescription>
          Each delete keeps a copy for 30 days. Restoring brings everything back as it was (an
          active project comes back parked if your limit is full).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isPending && snapshots.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing deleted recently.</p>
        )}
        <ul className="divide-y">
          {snapshots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              {s.kind === 'area' ? (
                <Shapes className="size-4 text-muted-foreground" />
              ) : (
                <FolderKanban className="size-4 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground">
                  {s.kind === 'area' ? 'Area' : 'Project'}
                  {s.kind === 'area' &&
                    s.projects > 0 &&
                    ` with ${s.projects} project${s.projects === 1 ? '' : 's'}`}
                  {s.tasks > 0 && ` · ${s.tasks} task${s.tasks === 1 ? '' : 's'}`} · deleted{' '}
                  {dateTime.format(new Date(s.createdAt))} · kept until{' '}
                  {date.format(new Date(s.expiresAt))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(s.id);
                  await actions.restoreSnapshot(s.id);
                  setBusy(null);
                }}
              >
                {busy === s.id ? 'Restoring…' : 'Restore'}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
