// Streaky's tour on Today (D31, D32): the invitation, his question, one step at a time, and the
// end. Each step is a real tutorial quest; doing the thing anywhere in the app completes it.

import {
  CHALLENGES,
  CHALLENGE_TEXT,
  GAME,
  TUTORIAL_STEPS,
  type Challenge,
  type TutorialStep,
} from '@streaktron/shared/game';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Gift, Timer, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Streaky, type StreakyMood } from '@/components/streaky';
import { Button } from '@/components/ui/button';
import { useTutorialActions } from '@/lib/actions';
import { tutorialQuery, type Tutorial } from '@/lib/queries';
import { newArea, newProject, startFocus } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

interface StepCopy {
  say: string;
  go: { label: string; icon?: ReactNode; run: () => void };
}

function useStepCopy(step: TutorialStep): StepCopy {
  const navigate = useNavigate();
  switch (step) {
    case 'tutorial.area':
      return {
        say: 'Areas are the big parts of your life, like Studies, Work or Health. Everything else lives inside one. Create your first.',
        go: { label: 'Create an area', run: () => newArea() },
      };
    case 'tutorial.project':
      return {
        say: 'A project is something with an end, like “Calculus exam” or “Portfolio site”. Only a few can be active at once, so you stay focused.',
        go: { label: 'Start a project', run: () => newProject() },
      };
    case 'tutorial.task':
      return {
        say: 'Now give a project its first task. Keep it small: something you could start today.',
        go: { label: 'Go to Projects', run: () => void navigate({ to: '/projects' }) },
      };
    case 'tutorial.complete':
      return {
        say: 'Finishing feels great. Complete any task, and today becomes your first active day.',
        go: { label: 'Go to all tasks', run: () => void navigate({ to: '/tasks' }) },
      };
    case 'tutorial.focus':
      return {
        say: 'Last one: 10 minutes of focus. Short sessions count too, and they keep your streak alive.',
        go: {
          label: `Start ${GAME.xp.focusMinMinutes} minutes`,
          icon: <Timer />,
          run: () => startFocus({ minutes: GAME.xp.focusMinMinutes }),
        },
      };
  }
}

export function TutorialCard() {
  const { data: t } = useQuery(tutorialQuery);
  if (!t || t.state === 'closed') return null;
  switch (t.state) {
    case 'new':
      return <Invitation />;
    case 'question':
      return <Question />;
    case 'active':
      return t.step ? <Step step={t.step} /> : null;
    case 'done':
      return <Finished />;
  }
}

function Card({
  mood,
  children,
  onClose,
}: {
  mood: StreakyMood;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <section
      aria-label="Streaky"
      className="relative flex flex-col items-center gap-3 rounded-xl border bg-gradient-to-br from-orange-50 to-amber-50/40 p-4 sm:flex-row sm:items-start dark:from-orange-950/30 dark:to-amber-950/10"
    >
      <Streaky mood={mood} size={104} className="-my-2" />
      <div className="w-full min-w-0 flex-1 space-y-3">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="End the tour"
          title="End the tour"
        >
          <X className="size-4" />
        </button>
      )}
    </section>
  );
}

function Invitation() {
  const tour = useTutorialActions();
  return (
    <Card mood="happy">
      <div>
        <p className="font-semibold">Hi, I’m Streaky!</p>
        <p className="text-sm text-muted-foreground">
          I keep your streak burning. Want a quick tour? You’ll set up something real and earn some
          XP on the way.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void tour.start()}>
          Show me around <ArrowRight />
        </Button>
        <Button variant="ghost" onClick={() => void tour.close()}>
          Not now
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">You can take the tour any time in Settings.</p>
    </Card>
  );
}

function Question() {
  const tour = useTutorialActions();
  const [busy, setBusy] = useState(false);
  const answer = async (c: Challenge | null) => {
    setBusy(true);
    const res = await tour.answer(c);
    setBusy(false);
    if (res && c)
      toast('Got it. I tuned the app for you.', { description: CHALLENGE_TEXT[c].tuning });
  };
  return (
    <Card mood="thinking">
      <div>
        <p className="font-semibold">
          First, a question: what’s your biggest challenge with discipline?
        </p>
        <p className="text-sm text-muted-foreground">
          Pick the one that sounds most like you, and I’ll tune the app a little. You can change it
          later in Settings.
        </p>
      </div>
      <div className="grid gap-1.5">
        {CHALLENGES.map((c) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => void answer(c)}
            className="rounded-lg border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
          >
            {CHALLENGE_TEXT[c].label}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void answer(null)}>
        I’m not sure, skip this
      </Button>
    </Card>
  );
}

function Step({ step }: { step: NonNullable<Tutorial['step']> }) {
  const tour = useTutorialActions();
  const key = step.key as TutorialStep;
  const copy = useStepCopy(key);
  const index = TUTORIAL_STEPS.indexOf(key);
  const last = index === TUTORIAL_STEPS.length - 1;

  return (
    <Card mood="happy" onClose={() => void tour.close()}>
      <div
        className="flex items-center gap-1.5"
        aria-label={`Step ${index + 1} of ${TUTORIAL_STEPS.length}`}
      >
        {TUTORIAL_STEPS.map((s, i) => (
          <span
            key={s}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i < index ? 'w-4 bg-primary' : i === index ? 'w-8 bg-primary' : 'w-4 bg-muted',
            )}
          />
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          Step {index + 1} of {TUTORIAL_STEPS.length}
        </span>
      </div>
      <div className="pr-6">
        <p className="font-semibold">{step.title}</p>
        <p className="text-sm text-muted-foreground">{copy.say}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={copy.go.run}>
          {copy.go.icon} {copy.go.label} {!copy.go.icon && <ArrowRight />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void tour.skip()}>
          Skip this step
        </Button>
        {step.xp > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Gift className="size-3.5" /> +{step.xp} XP{last ? ' and a large box' : ''}
          </span>
        )}
      </div>
    </Card>
  );
}

function Finished() {
  const tour = useTutorialActions();
  return (
    <Card mood="celebrating">
      <div>
        <p className="font-semibold">You’re all set!</p>
        <p className="text-sm text-muted-foreground">
          You know your way around now. Come back each day, even for ten minutes, and I’ll keep the
          flame going with you.
        </p>
      </div>
      <Button onClick={() => void tour.close()}>Thanks, Streaky</Button>
    </Card>
  );
}
