// The `links` table (D4): what each rich-text field mentions, rewritten on every save of that
// field, in the same transaction. Links have no behavioral effect; they power backlinks.

import { mentionsOf, type RichDoc } from '@strekatron/shared/rich';
import { newId } from '@strekatron/shared/ids';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { links } from '../db/schema';
import type { Conn } from './common';

type LinkField = (typeof links.$inferInsert)['sourceField'];

/**
 * Make `sourceId`'s links from `field` match what `doc` mentions. Nothing happens when the field
 * isn't being written (`doc` undefined). A thing mentioning itself isn't a link.
 */
export async function writeLinks(
  conn: Conn,
  userId: string,
  sourceId: string,
  doc: RichDoc | null | undefined,
  field: LinkField = 'description',
) {
  if (doc === undefined) return;
  const refs = mentionsOf(doc).filter((m) => m.targetId !== sourceId);
  await conn.delete(links).where(and(eq(links.sourceId, sourceId), eq(links.sourceField, field)));
  if (!refs.length) return;
  await conn.insert(links).values(
    refs.map((m) => ({
      id: newId('link'),
      userId,
      sourceId,
      sourceField: field,
      targetId: m.targetId,
    })),
  );
}

/**
 * Links whose source row no longer exists: purged tasks and goals, deleted projects and areas.
 * Restoring a snapshot writes its links again from the stored descriptions.
 */
export async function purgeOrphanLinks(conn: Conn = db) {
  const res = await conn.execute(sql`
    delete from links l
     where not exists (select 1 from tasks where id = l.source_id)
       and not exists (select 1 from goals where id = l.source_id)
       and not exists (select 1 from projects where id = l.source_id)
       and not exists (select 1 from areas where id = l.source_id)
  `);
  return res.rowCount ?? 0;
}
