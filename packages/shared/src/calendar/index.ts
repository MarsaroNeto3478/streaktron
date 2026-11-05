// Calendar (Phase 4, D35): events live on the user's local dates and wall-clock times ("floating",
// like an alarm clock), so DST and time-zone changes never move a 9:00 lecture. Recurrence is a
// small, tested subset of RFC 5545 RRULE (daily / weekly on weekdays / monthly / yearly, every N,
// until a date or N times), stored as a real RRULE string so a full library or an iCal import can
// read it later. Skipped occurrences are a list of dates (EXDATE).

import { addDays, daysBetween, startOfWeek, weekdayOf, type DateString } from '../time';

export const FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Freq = (typeof FREQS)[number];

export interface Recurrence {
  freq: Freq;
  /** Every `interval` days/weeks/months/years (1 = every). */
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday; empty = the start date's weekday. */
  byDay?: number[];
  /** The last date an occurrence may start on (inclusive). */
  until?: DateString;
  /** At most this many occurrences (counted from the first). */
  count?: number;
}

const RR_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RFC 5545 RRULE value (without the `RRULE:` prefix). */
export function toRRule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.byDay?.length) {
    parts.push(
      `BYDAY=${[...new Set(r.byDay)]
        .sort()
        .map((d) => RR_DAYS[d])
        .join(',')}`,
    );
  }
  if (r.until) parts.push(`UNTIL=${r.until.replaceAll('-', '')}`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

/** The subset `toRRule` writes; anything else answers null. */
export function parseRRule(s: string | null | undefined): Recurrence | null {
  if (!s) return null;
  const fields = new Map<string, string>();
  for (const part of s.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v) fields.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = fields.get('FREQ')?.toLowerCase() as Freq | undefined;
  if (!freq || !FREQS.includes(freq)) return null;
  const interval = Number(fields.get('INTERVAL') ?? 1);
  if (!Number.isInteger(interval) || interval < 1) return null;
  const r: Recurrence = { freq, interval };
  const byDay = fields.get('BYDAY');
  if (byDay) {
    const days = byDay.split(',').map((d) => RR_DAYS.indexOf(d));
    if (days.some((d) => d < 0)) return null;
    r.byDay = days;
  }
  const until = fields.get('UNTIL');
  if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(until);
    if (!m) return null;
    r.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  const count = fields.get('COUNT');
  if (count) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) return null;
    r.count = n;
  }
  return r;
}

const ymd = (d: DateString) => d.split('-').map(Number) as [number, number, number];

/** Whether the rule's pattern (ignoring until/count) lands on `day`. */
function matches(r: Recurrence, start: DateString, day: DateString): boolean {
  if (day < start) return false;
  const [sy, sm, sd] = ymd(start);
  const [y, m, d] = ymd(day);
  switch (r.freq) {
    case 'daily':
      return daysBetween(start, day) % r.interval === 0;
    case 'weekly': {
      const days = r.byDay?.length ? r.byDay : [weekdayOf(start)];
      if (!days.includes(weekdayOf(day))) return false;
      // Weeks counted Monday-first (RFC 5545's default WKST), from the start's week.
      const weeks = daysBetween(startOfWeek(start, 1), startOfWeek(day, 1)) / 7;
      return weeks % r.interval === 0;
    }
    case 'monthly': {
      // The same day of the month; months without it are skipped (RFC 5545).
      if (d !== sd) return false;
      const months = (y - sy) * 12 + (m - sm);
      return months % r.interval === 0;
    }
    case 'yearly':
      return m === sm && d === sd && (y - sy) % r.interval === 0;
  }
}

/**
 * The dates occurrences start on, within [from, to], oldest first. One-off events (no rule) have
 * one: their start. `skip` are removed occurrences (EXDATE); they still count toward COUNT.
 */
export function occurrences(
  event: { startDate: DateString; recurrence: Recurrence | null; skip?: readonly DateString[] },
  from: DateString,
  to: DateString,
): DateString[] {
  const { startDate, recurrence: r } = event;
  const skip = new Set(event.skip ?? []);
  if (!r) return startDate >= from && startDate <= to && !skip.has(startDate) ? [startDate] : [];

  const out: DateString[] = [];
  let last = to;
  if (r.until && r.until < last) last = r.until;
  // With COUNT the series has to be walked from its start; otherwise from the range's start.
  let day = r.count ? startDate : from > startDate ? from : startDate;
  let n = 0;
  for (; day <= last; day = addDays(day, 1)) {
    if (!matches(r, startDate, day)) continue;
    n++;
    if (r.count && n > r.count) break;
    if (day >= from && !skip.has(day)) out.push(day);
  }
  return out;
}

/** The first occurrence on or after `day` (null when the series is over). */
export function nextOccurrence(
  event: { startDate: DateString; recurrence: Recurrence | null; skip?: readonly DateString[] },
  day: DateString,
  horizonDays = 800,
): DateString | null {
  return occurrences(event, day, addDays(day, horizonDays))[0] ?? null;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Every week on Mon, Wed", "Every 2 months on day 5", "Yearly on Mar 14", "… until …". */
export function describeRecurrence(r: Recurrence, startDate: DateString, weekStart = 1): string {
  const every = (unit: string) =>
    r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  let text: string;
  const [, m, d] = ymd(startDate);
  switch (r.freq) {
    case 'daily':
      text = r.interval === 1 ? 'Every day' : every('day');
      break;
    case 'weekly': {
      const days = r.byDay?.length ? r.byDay : [weekdayOf(startDate)];
      const ordered = [0, 1, 2, 3, 4, 5, 6]
        .map((i) => (i + weekStart) % 7)
        .filter((x) => days.includes(x));
      text = `${every('week')} on ${ordered.map((x) => DAY_SHORT[x]).join(', ')}`;
      break;
    }
    case 'monthly':
      text = `${every('month')} on day ${d}`;
      break;
    case 'yearly':
      text = `${every('year')} on ${MONTHS[m - 1]} ${d}`;
      break;
  }
  if (r.until) text += `, until ${r.until}`;
  else if (r.count) text += `, ${r.count} times`;
  return text;
}

/** "Today", "Tomorrow", "In 12 days", "3 days ago". */
/** A date this many days away or fewer is "soon": countdowns and task dates turn amber (D39). */
export const SOON_DAYS = 3;

/** Whether `day` is today or within the next `SOON_DAYS` days. */
export const isSoon = (today: DateString, day: DateString) => {
  const n = daysBetween(today, day);
  return n >= 0 && n <= SOON_DAYS;
};

export function countdownLabel(today: DateString, day: DateString): string {
  const n = daysBetween(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** "HH:MM", 24-hour. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
