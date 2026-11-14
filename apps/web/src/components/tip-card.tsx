// Streaky's tip on Today (D31, D46): one at a time, the most pressing first. Put away, a tip stays
// hidden for a few days on this browser; nothing about tips is stored on the server.

import { pickTip, hiddenUntil, type Tip, type TipInput } from '@strekatron/shared/tips';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { Streaky } from '@/components/streaky';
import { Button } from '@/components/ui/button';
import {
  gameStateQuery,
  meQuery,
  projectsQuery,
  tasksQuery,
  todayQuery,
  tutorialQuery,
} from '@/lib/queries';
import { startFocus } from '@/lib/ui-store';

const KEY = 'strekatron.tips.hiddenUntil';

function readHidden(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeHidden(h: Record<string, string>, today: string) {
  // Forget entries whose day has come, so the map stays small.
  const kept = Object.fromEntries(Object.entries(h).filter(([, until]) => until > today));
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private mode or blocked storage: the tip just comes back on the next visit.
  }
}

/** The user's day hour is in the evening (from 18:00 with the day starting at midnight). */
function lateInDay(dayStartHour: number, now = new Date()) {
  const dayHour = (now.getHours() - dayStartHour + 24) % 24;
  return dayHour >= (18 - dayStartHour + 24) % 24;
}

export function TipCard() {
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const { data: game } = useQuery(gameStateQuery);
  const { data: today } = useQuery(todayQuery);
  const { data: projects } = useQuery(projectsQuery);
  const { data: inbox } = useQuery(tasksQuery({ project: 'inbox', status: 'open' }));
  const { data: tutorial } = useQuery(tutorialQuery);
  const [hidden, setHidden] = useState(readHidden);

  // Streaky's tour speaks first; tips wait until it's closed.
  if (!me || !game || !today || !projects || !inbox || !tutorial) return null;
  if (tutorial.state !== 'closed') return null;

  const input: TipInput = {
    today: me.today,
    challenge: me.settings.challenge,
    activeProjects: projects
      .filter((p) => p.status === 'active')
      .map((p) => ({
        id: p.id,
        title: p.title,
        openTasks: p.counts.open,
        hasNextAction: !!p.nextAction,
      })),
    inboxCount: inbox.length,
    focusEmpty: today.focus.length === 0,
    streak: { current: game.daily.current, activeToday: game.daily.activeToday },
    lateInDay: lateInDay(me.settings.dayStartHour),
    hiddenUntil: hidden,
  };
  const tip = pickTip(input);
  if (!tip) return null;

  const putAway = (t: Tip) => {
    const next = { ...hidden, [t.id]: hiddenUntil(t, me.today) };
    writeHidden(next, me.today);
    setHidden(next);
  };

  const act = () => {
    const a = tip.action;
    if (!a) return;
    if (a.kind === 'focus') startFocus({});
    else if (a.kind === 'project')
      void navigate({ to: '/projects/$projectId', params: { projectId: a.projectId } });
    else void navigate({ to: a.to });
  };

  return (
    <section
      aria-label="A tip from Streaky"
      className="flex items-center gap-4 rounded-xl border bg-card p-4"
    >
      <Streaky mood={tip.mood} size={56} className="-my-2" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{tip.title}</p>
        <p className="text-sm text-muted-foreground">{tip.body}</p>
        {tip.action && (
          <Button variant="link" className="h-auto px-0 pt-1" onClick={act}>
            {tip.action.label} <ArrowRight />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 self-start text-muted-foreground"
        aria-label="Put this tip away"
        title="Put this tip away"
        onClick={() => putAway(tip)}
      >
        <X />
      </Button>
    </section>
  );
}
