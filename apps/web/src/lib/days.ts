// Showing days. A `YYYY-MM-DD` day is formatted at noon UTC, read in UTC, so no local offset can
// turn it into its neighbour.

import { daysBetween } from '@strekatron/shared/time';

const long = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Tuesday, November 3" */
export const formatDayLong = (day: string) => long.format(new Date(`${day}T12:00:00Z`));

const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

const atNoon = (day: string) => new Date(`${day}T12:00:00Z`);

/**
 * A day relative to today: "Today", "Tomorrow", "Yesterday", a weekday within the next week,
 * "Nov 12" this year, "Jan 3, 2027" otherwise.
 */
export function formatDayShort(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekday.format(atNoon(day));
  return day.slice(0, 4) === today.slice(0, 4)
    ? short.format(atNoon(day))
    : shortYear.format(atNoon(day));
}

/** "N days left", "Due today", "N days late". */
export function countdown(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Due today';
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} left`;
  return `${-diff} day${diff === -1 ? '' : 's'} late`;
}

/** “1 h 30 min”, “2 h”, “45 min”. */
export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? (rest ? `${h} h ${rest} min` : `${h} h`) : `${rest} min`;
};
