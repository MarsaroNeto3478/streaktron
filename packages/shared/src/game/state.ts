// The whole game state from the activity log, and the events a write caused (before → after).

import type { DateString } from '../time';
import type { Activity } from './activity';
import {
  activeDaysOf,
  dailyStreak,
  weeklyStreak,
  type DailyStreak,
  type WeeklyStreak,
} from './streaks';
import { levelProgress, totalXp, xpCredits, type LevelProgress } from './xp';

export interface GameSettings {
  today: DateString;
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: number;
  weeklyActiveDayTarget: number;
}

export interface GameState {
  today: DateString;
  xp: number;
  /** XP earned today. */
  xpToday: number;
  level: LevelProgress;
  daily: DailyStreak;
  weekly: WeeklyStreak;
}

export function gameState(activities: readonly Activity[], s: GameSettings): GameState {
  const credits = xpCredits(activities);
  const xp = totalXp(credits);
  let xpToday = 0;
  for (const a of activities) if (a.localDate === s.today) xpToday += credits.get(a.id) ?? 0;
  const active = activeDaysOf(activities);
  return {
    today: s.today,
    xp,
    xpToday,
    level: levelProgress(xp),
    daily: dailyStreak(active, s.today),
    weekly: weeklyStreak(active, s.today, s.weekStart, s.weeklyActiveDayTarget),
  };
}

export interface QuestDone {
  id: string;
  type: string;
  title: string;
  xp: number;
  boxTier: string;
}

/** What a write caused, for the UI to celebrate at once (the `game` block of a write response). */
export interface GameEvents {
  /** XP the write earned (0 when nothing new counted). */
  xp: number;
  levelUp: { from: number; to: number } | null;
  /** The daily streak grew (today became active). */
  streak: { from: number; to: number } | null;
  freezeEarned: boolean;
  weekMet: boolean;
  questsDone: QuestDone[];
  /** A follow-up quest that appeared (a make quest was done). */
  questsAdded: { id: string; title: string }[];
  state: GameState;
}

export function gameEvents(
  before: GameState,
  after: GameState,
  quests: { done: QuestDone[]; added: { id: string; title: string }[] },
): GameEvents {
  return {
    xp: Math.max(0, after.xp - before.xp),
    levelUp:
      after.level.level > before.level.level
        ? { from: before.level.level, to: after.level.level }
        : null,
    streak:
      after.daily.current > before.daily.current
        ? { from: before.daily.current, to: after.daily.current }
        : null,
    freezeEarned: after.daily.freezes > before.daily.freezes,
    weekMet: after.weekly.week.met && !before.weekly.week.met,
    questsDone: quests.done,
    questsAdded: quests.added,
    state: after,
  };
}

/** Whether a write caused anything worth showing. */
export const eventful = (e: GameEvents) =>
  e.xp > 0 ||
  e.levelUp !== null ||
  e.streak !== null ||
  e.freezeEarned ||
  e.weekMet ||
  e.questsDone.length > 0 ||
  e.questsAdded.length > 0;
