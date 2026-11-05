// Every linkable thing (areas, projects, goals, tasks) as one list, for search, mention chips
// (`resolve`) and backlinks. One function per question (plan.md §11): "what is this id", "what
// mentions it".

import { mentionsOf, type LinkableKind, type RichDoc } from '@strekatron/shared/rich';
import type { ColorKey, IconKey } from '@strekatron/shared/structure';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { notFound } from './common';

/**
 * The user's entities with what a list or chip shows about them. Columns: kind, id, title,
 * context (the area of a project, the project of a goal or task, "Inbox"), project_id, status,
 * closed, deleted (soft-deleted tasks and goals), icon and color (areas and projects),
 * description_text, description (the document), search_vector, updated_at.
 */
export function entitiesSql(userId: string, { withDeleted = false } = {}): SQL {
  const live = (col: SQL) => (withDeleted ? sql`true` : sql`${col} is null`);
  return sql`
    select 'area'::text as kind, a.id, a.title, null::text as context, null::text as project_id,
           case when a.archived_at is null then 'active' else 'archived' end as status,
           a.archived_at is not null as closed, false as deleted, a.icon, a.color,
           a.description_text, a.description, a.search_vector, a.updated_at
      from areas a where a.user_id = ${userId}
    union all
    select 'project', p.id, p.title, ar.title, p.id, p.status,
           p.status in ('completed', 'archived'), false, p.icon, p.color,
           p.description_text, p.description, p.search_vector, p.updated_at
      from projects p left join areas ar on ar.id = p.area_id
     where p.user_id = ${userId}
    union all
    select 'goal', g.id, g.title, p.title, g.project_id, g.status,
           g.status <> 'open', g.deleted_at is not null, null, null,
           g.description_text, g.description, g.search_vector, g.updated_at
      from goals g join projects p on p.id = g.project_id
     where g.user_id = ${userId} and ${live(sql`g.deleted_at`)}
    union all
    select 'task', t.id, t.title, coalesce(p.title, 'Inbox'), t.project_id,
           case when t.completed_at is null then 'open' else 'done' end,
           t.completed_at is not null, t.deleted_at is not null, null, null,
           t.description_text, t.description, t.search_vector, t.updated_at
      from tasks t left join projects p on p.id = t.project_id
     where t.user_id = ${userId} and ${live(sql`t.deleted_at`)}
  `;
}

export type EntityRow = {
  kind: LinkableKind;
  id: string;
  title: string;
  context: string | null;
  project_id: string | null;
  status: string;
  closed: boolean;
  deleted: boolean;
  icon: IconKey | null;
  color: ColorKey | null;
  description_text: string;
};

/** What every list of entities returns about each one. */
export interface EntityRef {
  kind: LinkableKind;
  id: string;
  title: string;
  /** Where it lives: the area of a project, the project of a goal or task ("Inbox" for none). */
  context: string | null;
  projectId: string | null;
  /** task: open/done · goal: open/achieved/dropped · project: its status · area: active/archived */
  status: string;
  closed: boolean;
  /** Areas and projects have their own look; goals and tasks show their kind's icon. */
  icon: IconKey | null;
  color: ColorKey | null;
}

/** The columns of `entitiesSql` that `EntityRow` reads (as `e`). */
export const ENTITY_COLUMNS = sql.raw(
  'e.kind, e.id, e.title, e.context, e.project_id, e.status, e.closed, e.deleted, e.icon, e.color, e.description_text',
);

export const toRef = (r: EntityRow): EntityRef => ({
  kind: r.kind,
  id: r.id,
  title: r.title,
  context: r.context,
  projectId: r.project_id,
  status: r.status,
  closed: r.closed,
  icon: r.icon,
  color: r.color,
});

export const PREVIEW_CHARS = 280;

/**
 * What mention chips show: the current title and state of each id. Soft-deleted tasks and goals
 * come back with `deleted: true`; ids that don't exist (or aren't this user's) are left out, and
 * the client shows them as broken links.
 */
export async function resolveEntities(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const res = await db.execute<EntityRow>(sql`
    select ${ENTITY_COLUMNS} from (${entitiesSql(userId, { withDeleted: true })}) e
     where e.id in (${sql.join(
       ids.map((id) => sql`${id}`),
       sql`, `,
     )})
  `);
  return res.rows.map((r) => ({
    ...toRef(r),
    deleted: r.deleted,
    preview: r.description_text.slice(0, PREVIEW_CHARS),
  }));
}

const KIND_ORDER = sql`case e.kind when 'task' then 0 when 'goal' then 1 when 'project' then 2 else 3 end`;

/**
 * What mentions `targetId` (live sources only), with the line each mention is in. The target must
 * be this user's (a soft-deleted one still has its backlinks). Lines are made from the sources'
 * documents now, so the mentions in them read with their current titles.
 */
export async function backlinks(userId: string, targetId: string) {
  if (!(await resolveEntities(userId, [targetId])).length) throw notFound('item');
  const res = await db.execute<EntityRow & { description: RichDoc | null }>(sql`
    select ${ENTITY_COLUMNS}, e.description
      from links l join (${entitiesSql(userId)}) e on e.id = l.source_id
     where l.user_id = ${userId} and l.target_id = ${targetId} and e.id <> ${targetId}
     order by ${KIND_ORDER}, e.updated_at desc
  `);
  const mentioned = new Set(
    res.rows.flatMap((r) => mentionsOf(r.description).map((m) => m.targetId)),
  );
  const titles = new Map(
    (await resolveEntities(userId, [...mentioned])).map((e) => [e.id, e.title]),
  );
  return res.rows.map((r) => ({
    ...toRef(r),
    snippet:
      mentionsOf(r.description, (id) => titles.get(id)).find((m) => m.targetId === targetId)
        ?.snippet ?? '',
  }));
}
