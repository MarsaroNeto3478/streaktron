// Type-prefixed ULIDs: `tsk_01JC3Z…`. The prefix tells what an id points to (mentions, backlinks,
// `resolve`), the ULID keeps ids sortable by creation time. One table of prefixes, so no two kinds
// can end up sharing one.

export const ID_PREFIXES = {
  user: 'usr',
  session: 'ses',
  account: 'acc',
  verification: 'ver',
  area: 'are',
  project: 'prj',
  boardColumn: 'col',
  goal: 'gol',
  task: 'tsk',
  habit: 'hab',
  habitCheckin: 'chk',
  event: 'evt',
  focusSession: 'fcs',
  weeklyReview: 'rev',
  activity: 'act',
  quest: 'qst',
  lootBox: 'box',
  inventoryItem: 'inv',
  placement: 'plc',
  achievement: 'ach',
  link: 'lnk',
  snapshot: 'snp',
  pushSubscription: 'psh',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdKind];

const KIND_BY_PREFIX = new Map<string, IdKind>(
  Object.entries(ID_PREFIXES).map(([kind, prefix]) => [prefix, kind as IdKind]),
);

// Crockford base32, as in the ULID spec.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const MAX_TIME = 2 ** 48 - 1;

// Web Crypto, present in browsers and Node; declared here so this package needs no DOM or Node types.
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

/** A ULID: 48 bits of milliseconds since the epoch, then 80 random bits. */
export function ulid(now: number = Date.now()): string {
  if (!Number.isInteger(now) || now < 0 || now > MAX_TIME) {
    throw new RangeError(`ulid: time out of range: ${now}`);
  }
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let random = '';
  for (const b of bytes) random += ALPHABET[b % 32]; // 256 is a multiple of 32: no bias
  return time + random;
}

/** A new id for an entity of this kind. */
export function newId(kind: IdKind, now?: number): string {
  return `${ID_PREFIXES[kind]}_${ulid(now)}`;
}

export interface ParsedId {
  kind: IdKind;
  prefix: IdPrefix;
  ulid: string;
}

/** What an id points to, or null when it isn't one of ours. */
export function parseId(id: string): ParsedId | null {
  const sep = id.indexOf('_');
  if (sep < 0) return null;
  const prefix = id.slice(0, sep);
  const rest = id.slice(sep + 1);
  const kind = KIND_BY_PREFIX.get(prefix);
  if (!kind || !ULID_RE.test(rest)) return null;
  return { kind, prefix: prefix as IdPrefix, ulid: rest };
}

/** Whether `id` is a well-formed id (of `kind`, when given). */
export function isId(id: unknown, kind?: IdKind): id is string {
  if (typeof id !== 'string') return false;
  const parsed = parseId(id);
  return parsed !== null && (kind === undefined || parsed.kind === kind);
}

/** When the id was made (from its ULID's time part). */
export function idTime(id: string): Date | null {
  const parsed = parseId(id);
  if (!parsed) return null;
  let ms = 0;
  for (const ch of parsed.ulid.slice(0, 10)) ms = ms * 32 + ALPHABET.indexOf(ch);
  return new Date(ms);
}
