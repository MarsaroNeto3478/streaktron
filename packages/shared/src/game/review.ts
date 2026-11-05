// The weekly review (D38): when it's offered, which week it counts for, and what it looks back on.
// One review a week. Today reminds you in the review window (the last two days of your week and
// the first day of the next); a review done on that first day still counts for the week before.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';
import { GAME } from './config';

/** The week (its first day) a review done `today` counts for. */
export function reviewWeek(today: DateString, weekStart: number): DateString {
  const start = startOfWeek(today, weekStart);
  return today === start ? addDays(start, -7) : start;
}

/** Whether Today should remind about the review: the end of the week, or the next week's first day. */
export function inReviewWindow(today: DateString, weekStart: number): boolean {
  const i = daysBetween(startOfWeek(today, weekStart), today);
  return i === 0 || i >= 7 - GAME.review.windowDays;
}

/** The days a review looks back on: the last seven, today included. */
export const reviewRange = (today: DateString) => ({ from: addDays(today, -6), to: today });
