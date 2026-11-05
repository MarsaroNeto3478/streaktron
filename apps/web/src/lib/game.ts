// What happens when a write earned something: the game's queries take the new state at once, and a
// short, quiet toast says what changed (plan.md §4.5: immediate, subtle feedback). Also the chime
// for focus sessions (Web Audio, no files).

import { TUTORIAL_TITLES, type DetailPart, type GameEvents } from '@streaktron/shared/game';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { Quest } from './queries';

/**
 * What makes a day count for the streak. Creating things or finishing a quest doesn't, on purpose:
 * a streak kept by too little doesn't help anyone get better (plan.md §5).
 */
export const STREAK_RULE = 'Complete a task, focus for 10 minutes or check in a habit';

/** Quests whose completion alone doesn't make the day count (they don't need a task, focus or habit). */
export const notForStreak = (templateKey: string) =>
  templateKey.startsWith('make.') ||
  templateKey.startsWith('follow_up.') ||
  templateKey === 'quick.pin_next' ||
  templateKey === 'quick.triage' ||
  templateKey === 'tutorial.area' ||
  templateKey === 'tutorial.project' ||
  templateKey === 'tutorial.task';

// --- The burst (components/celebration.tsx draws it) -----------------------------------------

export interface Burst {
  id: number;
  kind: 'quest' | 'level';
  text: string;
}

let burst: Burst | null = null;
const burstListeners = new Set<() => void>();

function showBurst(kind: Burst['kind'], text: string) {
  burst = { id: Date.now(), kind, text };
  for (const l of burstListeners) l();
}

export function useBurst(): Burst | null {
  return useSyncExternalStore(
    (l) => {
      burstListeners.add(l);
      return () => burstListeners.delete(l);
    },
    () => burst,
  );
}

export function celebrate(qc: QueryClient, e: GameEvents) {
  qc.setQueryData(['game', 'state'], e.state);
  void qc.invalidateQueries({ queryKey: ['game'] });

  if (e.levelUp) showBurst('level', `Level ${e.levelUp.to}`);
  else if (e.questsDone.length) {
    showBurst(
      'quest',
      e.questsDone.length === 1 ? 'Quest done' : `${e.questsDone.length} quests done`,
    );
  }

  if (e.levelUp) {
    chime('level');
    toast.success(`Level ${e.levelUp.to}!`, { description: `+${e.xp} XP` });
  }
  for (const q of e.questsDone) {
    if (!e.levelUp) chime('quest');
    const tour = q.type === 'tutorial';
    // A quest alone doesn't keep the streak: say so while today doesn't count yet.
    const hint = e.state.daily.activeToday ? null : `${STREAK_RULE} to keep your streak.`;
    toast.success(`${tour ? 'Step done' : 'Quest done'}: ${q.title}`, {
      description: [q.xp > 0 ? `+${q.xp} XP` : null, hint].filter(Boolean).join(' · ') || undefined,
    });
  }
  // The tour's next step shows in Streaky's card, not as a toast.
  const steps = new Set<string>(Object.values(TUTORIAL_TITLES));
  for (const q of e.questsAdded) {
    if (steps.has(q.title)) continue;
    toast(`New quest: ${q.title}`, { description: 'Lasts until the end of tomorrow.' });
  }
  if (e.questsDone.some((q) => q.type === 'tutorial')) {
    void qc.invalidateQueries({ queryKey: ['tutorial'] });
  }
  if (e.streak && !e.levelUp) {
    toast(`${e.streak.to}-day streak`, {
      description: e.streak.to === 1 ? 'Today counts.' : 'Today counts. Keep it going.',
    });
  }
  if (e.freezeEarned)
    toast('Streak freeze earned', { description: 'A missed day won’t break it.' });
  if (e.weekMet) toast.success('Weekly target met', { description: 'The weekly streak grows.' });
  // XP alone: a small, quick note.
  if (e.xp > 0 && !e.levelUp && !e.questsDone.length && !e.streak) {
    toast(`+${e.xp} XP`, { duration: 1500 });
  }
}

// --- Sound -----------------------------------------------------------------------------------

let ctx: AudioContext | null = null;

/** A short synthesized chime: `focus` when a session ends, `quest` and `level` for rewards. */
export function chime(kind: 'focus' | 'quest' | 'level') {
  try {
    ctx ??= new AudioContext();
    const notes =
      kind === 'focus' ? [660, 880, 990] : kind === 'level' ? [523, 659, 784, 1047] : [784, 1047];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(kind === 'focus' ? 0.18 : 0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    // No audio (blocked autoplay, old browser): stay quiet.
  }
}

/** The parts a follow-up still needs, in the order it asked for them. */
export function missingParts(q: Pick<Quest, 'params' | 'filled'>): DetailPart[] {
  const missing = (q.params.missing as DetailPart[] | undefined) ?? [];
  const filled = new Set(q.filled ?? []);
  return missing.filter((p) => !filled.has(p));
}
