// The collection (plan.md §4.9, D48): loot boxes waiting to be opened, and the album of every
// collectible, owned ones in color and the rest as silhouettes.

import { CATALOGUE, CATEGORIES, CATEGORY_NAMES, RARITIES } from '@strekatron/shared/collectibles';
import { BOX_TIERS } from '@strekatron/shared/game';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Gift } from 'lucide-react';
import { useState } from 'react';
import { BoxIcon, ItemTile, LootReveal, type Opened } from '@/components/loot';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useGameActions } from '@/lib/actions';
import { TIER_NAMES } from '@/lib/loot';
import { collectionQuery, lootQuery, type LootBox } from '@/lib/queries';

export const Route = createFileRoute('/_app/collection')({
  component: CollectionPage,
});

function CollectionPage() {
  const { data: loot } = useQuery(lootQuery);
  const { data: col } = useQuery(collectionQuery);
  const actions = useGameActions();
  const [results, setResults] = useState<Opened[] | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (which: { id: string } | 'all') => {
    if (busy) return;
    setBusy(true);
    const opened = await actions.openBoxes(which);
    setBusy(false);
    if (opened?.length) setResults(opened as Opened[]);
  };
  // Boxes not opened yet (the list may still hold the ones just opened until it refetches).
  const waiting = loot?.filter((b) => !results?.some((r) => r.boxId === b.id)) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Collection"
        description="Every quest you complete earns a loot box. What comes out is yours to keep, and will furnish your bedroom later."
      />
      {loot && (
        <Boxes
          boxes={loot}
          busy={busy}
          onOpen={() => loot[0] && void open({ id: loot[0].id })}
          onOpenAll={() => void open('all')}
        />
      )}
      {col && <Album owned={new Map(col.owned.map((o) => [o.key, o.count]))} />}
      <LootReveal
        results={results}
        remaining={waiting.length}
        onOpenNext={() => waiting[0] && void open({ id: waiting[0].id })}
        onClose={() => setResults(null)}
      />
    </div>
  );
}

function Boxes({
  boxes,
  busy,
  onOpen,
  onOpenAll,
}: {
  boxes: LootBox[];
  busy: boolean;
  onOpen: () => void;
  onOpenAll: () => void;
}) {
  if (!boxes.length) {
    return (
      <section className="flex items-center gap-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <Gift className="size-5 shrink-0" />
        No boxes to open. Complete a quest to earn one.
      </section>
    );
  }
  const byTier = BOX_TIERS.map(
    (t) => [t, boxes.filter((b) => b.tier === t).length] as const,
  ).filter(([, n]) => n > 0);
  const first = boxes[0]!;
  return (
    <section
      aria-label="Loot boxes"
      className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex -space-x-3">
        {boxes.slice(0, 5).map((b) => (
          <BoxIcon key={b.id} tier={b.tier} className="ring-2 ring-card" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {boxes.length === 1 ? '1 box to open' : `${boxes.length} boxes to open`}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {byTier.map(([t, n]) => `${n} × ${TIER_NAMES[t].toLowerCase()}`).join(' · ')}
          {first.questTitle && ` · oldest from “${first.questTitle}”`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onOpen} disabled={busy}>
          Open
        </Button>
        {boxes.length > 1 && (
          <Button variant="outline" onClick={onOpenAll} disabled={busy}>
            Open all
          </Button>
        )}
      </div>
    </section>
  );
}

const rank = (r: (typeof RARITIES)[number]) => RARITIES.indexOf(r);

function Album({ owned }: { owned: Map<string, number> }) {
  const have = CATALOGUE.filter((c) => owned.has(c.key)).length;
  const pct = Math.round((have / CATALOGUE.length) * 100);
  return (
    <section aria-label="Album" className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Album</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {have} / {CATALOGUE.length} found · {pct}%
          </span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={have}
          aria-valuemax={CATALOGUE.length}
          aria-label="Collectibles found"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {CATEGORIES.map((cat) => {
        const items = CATALOGUE.filter((c) => c.category === cat).sort(
          (a, b) => rank(a.rarity) - rank(b.rarity) || a.name.localeCompare(b.name),
        );
        const n = items.filter((c) => owned.has(c.key)).length;
        return (
          <div key={cat}>
            <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
              {CATEGORY_NAMES[cat]}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {n} / {items.length}
              </span>
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {items.map((c) => (
                <ItemTile key={c.key} itemKey={c.key} count={owned.get(c.key) ?? 0} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
