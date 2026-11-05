// Mentioned things (D4): their current titles for mention chips, fetched in batches, and what
// mentions them (backlinks).
//
//   const { data } = useQuery(entityQuery(id)); // null: deleted for good, or not yours
//
// Chips on screen ask for their ids at the same moment; `load` gathers the ids asked for in one
// tick into one `/api/entities/resolve` call. Writes that change titles or states call
// `refreshEntities`, which refetches the chips and backlinks on screen.

import { MAX_RESOLVE_IDS } from '@strekatron/shared/schemas';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { api, call } from './api';

const fetchResolve = (ids: string[]) =>
  call(api.entities.resolve.$get({ query: { ids: ids.join(',') } }));
export type ResolvedEntity = Awaited<ReturnType<typeof fetchResolve>>['entities'][number];

const fetchBacklinks = (id: string) => call(api.entities[':id'].backlinks.$get({ param: { id } }));
export type Backlink = Awaited<ReturnType<typeof fetchBacklinks>>['backlinks'][number];

/** Enough of an entity to show it and open it. */
export type EntityRef = Pick<ResolvedEntity, 'kind' | 'id' | 'projectId'> &
  Partial<Omit<ResolvedEntity, 'kind' | 'id' | 'projectId'>>;

type Waiter = { resolve: (e: ResolvedEntity | null) => void; reject: (err: unknown) => void };
let waiting = new Map<string, Waiter[]>();
let scheduled = false;

async function flush() {
  const batch = waiting;
  waiting = new Map();
  scheduled = false;
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += MAX_RESOLVE_IDS) {
    const chunk = ids.slice(i, i + MAX_RESOLVE_IDS);
    try {
      const { entities } = await fetchResolve(chunk);
      const byId = new Map(entities.map((e) => [e.id, e]));
      for (const id of chunk) for (const w of batch.get(id)!) w.resolve(byId.get(id) ?? null);
    } catch (err) {
      for (const id of chunk) for (const w of batch.get(id)!) w.reject(err);
    }
  }
}

/** One entity, through the next batched resolve call. */
function load(id: string): Promise<ResolvedEntity | null> {
  return new Promise((resolve, reject) => {
    const list = waiting.get(id) ?? [];
    list.push({ resolve, reject });
    waiting.set(id, list);
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), 0);
    }
  });
}

/** A mentioned entity's current title and state; null when it's gone. */
export const entityQuery = (id: string) =>
  queryOptions({
    queryKey: ['entity', id],
    queryFn: () => load(id),
    staleTime: 30_000,
  });

export const backlinksQuery = (id: string) =>
  queryOptions({
    queryKey: ['backlinks', id],
    queryFn: async () => (await fetchBacklinks(id)).backlinks,
  });

/** After writes that change titles, states or descriptions: refetch chips and backlinks shown. */
export function refreshEntities(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['entity'] });
  void qc.invalidateQueries({ queryKey: ['backlinks'] });
}

export const KIND_LABEL = {
  task: 'Task',
  goal: 'Goal',
  project: 'Project',
  area: 'Area',
} as const;

export const KIND_PLURAL = {
  task: 'Tasks',
  goal: 'Goals',
  project: 'Projects',
  area: 'Areas',
} as const;
