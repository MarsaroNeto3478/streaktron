// Finding things, for the command palette and the mention picker (plan.md §4.1). Postgres
// full-text search over titles and descriptions (accent- and case-insensitive, every word a
// prefix, in any order), plus trigram similarity on titles so a typo still finds them.
//
// Ranking: titles that start with the query, then titles containing it, then full-text rank
// (titles weigh more than descriptions), then similarity; open things before closed ones, shorter
// titles, recent ones. An empty query lists recently changed open things (the picker's first view).

import { SNIPPET_CHARS, snippetAround, type LinkableKind } from '@strekatron/shared/rich';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { ENTITY_COLUMNS, entitiesSql, toRef, type EntityRef, type EntityRow } from './entities';

export interface SearchHit extends EntityRef {
  /** Where the query was found. */
  match: 'title' | 'text' | 'recent';
  /** For a match in the description: the words around it. */
  snippet: string | null;
}

/** Below this, a title doesn't count as a typo of a query word ("algerba" ~ "algebra" is 0.5). */
const MIN_SIMILARITY = 0.5;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The words of a query (letters and digits), lowercased. */
export const queryWords = (q: string) => q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Accents removed, one character for one (so positions stay put). */
const fold = (s: string) =>
  [...s.toLowerCase()].map((ch) => ch.normalize('NFD').replace(/\p{M}/gu, '')[0] ?? ch).join('');

/** The words around the first query word found in `text`. */
function snippetFor(text: string, words: string[]): string | null {
  const folded = fold(text);
  for (const w of words) {
    const at = folded.indexOf(fold(w));
    if (at >= 0) return snippetAround(text, at, SNIPPET_CHARS);
  }
  return null;
}

export async function search(
  userId: string,
  q: string,
  limit: number,
  types?: LinkableKind[],
): Promise<SearchHit[]> {
  const kinds = types?.length
    ? sql`and e.kind in (${sql.join(
        types.map((t) => sql`${t}`),
        sql`, `,
      )})`
    : sql``;

  if (!q.trim()) {
    const res = await db.execute<EntityRow>(sql`
      select ${ENTITY_COLUMNS} from (${entitiesSql(userId)}) e
       where not e.closed ${kinds}
       order by e.updated_at desc
       limit ${limit}
    `);
    return res.rows.map((r) => ({ ...toRef(r), match: 'recent', snippet: null }));
  }

  const words = queryWords(q);
  if (!words.length) return [];
  // Safe to hand to to_tsquery: only letters and digits, joined by our own operators.
  const tsquery = words.map((w) => `${w}:*`).join(' & ');
  const phrase = words.join(' ');
  const like = escapeLike(q.trim().toLowerCase());

  const res = await db.execute<EntityRow & { title_match: boolean }>(sql`
    with q as (
      select to_tsquery('simple', f_unaccent(${tsquery})) as query,
             lower(f_unaccent(${phrase})) as phrase,
             lower(f_unaccent(${like})) as needle
    ),
    scored as (
      select e.*,
             lower(f_unaccent(e.title)) like q.needle || '%' as starts,
             lower(f_unaccent(e.title)) like '%' || q.needle || '%' as contains,
             e.search_vector @@ q.query as fts,
             to_tsvector('simple', f_unaccent(e.title)) @@ q.query as fts_title,
             ts_rank(e.search_vector, q.query) as rank,
             -- Every word must be close to a word of the title, so one typed word doesn't
             -- carry a query of several.
             (select min(word_similarity(w, lower(f_unaccent(e.title))))
                from regexp_split_to_table(q.phrase, ' ') w) as sim
        from (${entitiesSql(userId)}) e, q
       where true ${kinds}
    )
    select ${ENTITY_COLUMNS}, (e.contains or e.fts_title or e.sim >= ${MIN_SIMILARITY}) as title_match
      from scored e
     where e.contains or e.fts or e.sim >= ${MIN_SIMILARITY}
     order by e.starts desc, e.contains desc, e.fts_title desc, e.rank desc, e.sim desc,
              e.closed, length(e.title), e.updated_at desc
     limit ${limit}
  `);
  return res.rows.map((r) => ({
    ...toRef(r),
    match: r.title_match ? 'title' : 'text',
    snippet: r.title_match ? null : snippetFor(r.description_text, words),
  }));
}
