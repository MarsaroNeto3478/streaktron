// Loot boxes on the web (D48): the colors of each rarity, a collectible's tile, and the reveal
// dialog. The box shakes, then opens into what came out; a click (or Skip) jumps to the result.

import {
  collectible,
  RARITIES,
  RARITY_NAMES,
  spriteUrl,
  type Rarity,
} from '@strekatron/shared/collectibles';
import type { BoxTier } from '@strekatron/shared/game';
import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { chime } from '@/lib/game';
import { TIER_NAMES } from '@/lib/loot';
import { cn } from '@/lib/utils';

const RARITY_STYLE: Record<Rarity, { text: string; border: string; glow: string }> = {
  common: {
    text: 'text-zinc-500',
    border: 'border-zinc-300 dark:border-zinc-600',
    glow: 'bg-zinc-400',
  },
  uncommon: {
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-400',
    glow: 'bg-emerald-400',
  },
  rare: { text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-400', glow: 'bg-sky-400' },
  epic: {
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-500',
    glow: 'bg-violet-500',
  },
  legendary: {
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-400',
    glow: 'bg-amber-400',
  },
};

const TIER_STYLE: Record<BoxTier, string> = {
  small: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100',
  standard: 'bg-primary/15 text-primary',
  large: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  special: 'bg-amber-400/20 text-amber-600 dark:text-amber-400',
};

/** A box, drawn as a gift in its tier's color. */
export function BoxIcon({ tier, className }: { tier: BoxTier; className?: string }) {
  const size =
    tier === 'small' ? 'size-9' : tier === 'large' || tier === 'special' ? 'size-12' : 'size-10';
  return (
    <span
      className={cn('grid place-items-center rounded-xl', size, TIER_STYLE[tier], className)}
      title={TIER_NAMES[tier]}
    >
      <Gift className="size-1/2" />
    </span>
  );
}

export interface Opened {
  boxId: string;
  tier: BoxTier;
  rarity: Rarity;
  itemKey: string;
  isNew: boolean;
}

const rank = (r: Rarity) => RARITIES.indexOf(r);
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What came out of one or more boxes. `remaining`: boxes still unopened, for "Open next". */
export function LootReveal({
  results,
  remaining,
  onOpenNext,
  onClose,
}: {
  results: Opened[] | null;
  remaining: number;
  onOpenNext: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<Opened[] | null>(null);
  const revealed = results !== null && shown === results;

  useEffect(() => {
    if (!results) return;
    const t = setTimeout(() => setShown(results), reducedMotion() ? 0 : 900);
    return () => clearTimeout(t);
  }, [results]);

  useEffect(() => {
    if (!revealed || !results.length) return;
    chime(results.some((r) => rank(r.rarity) >= rank('rare')) ? 'level' : 'quest');
  }, [revealed, results]);

  const best = results?.reduce((a, b) => (rank(b.rarity) > rank(a.rarity) ? b : a), results[0]!);
  const many = (results?.length ?? 0) > 1;

  return (
    <Dialog open={results !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onClick={() => results && !revealed && setShown(results)}
      >
        {!revealed || !best ? (
          <div className="flex flex-col items-center gap-6 py-10">
            <DialogTitle className="sr-only">Opening</DialogTitle>
            <DialogDescription className="sr-only">The box is opening.</DialogDescription>
            <BoxIcon tier={best?.tier ?? 'standard'} className="animate-loot-shake size-24" />
            <Button variant="ghost" size="sm" onClick={() => results && setShown(results)}>
              Skip
            </Button>
          </div>
        ) : many ? (
          <ManyResults results={results!} />
        ) : (
          <OneResult o={best} />
        )}
        {revealed && (
          <div className="flex justify-center gap-2">
            {remaining > 0 && (
              <Button onClick={onOpenNext}>
                Open next{remaining > 1 ? ` (${remaining} left)` : ''}
              </Button>
            )}
            <Button variant={remaining > 0 ? 'outline' : 'default'} onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OneResult({ o }: { o: Opened }) {
  const item = collectible(o.itemKey);
  const style = RARITY_STYLE[o.rarity];
  return (
    <div className="flex flex-col items-center gap-2 pt-4 text-center">
      <div className="relative grid size-44 place-items-center">
        <span
          className={cn('animate-loot-glow absolute inset-4 rounded-full blur-2xl', style.glow)}
          aria-hidden
        />
        {item && (
          <img
            src={spriteUrl(item)}
            alt=""
            className="animate-loot-reveal relative max-h-40 max-w-40 object-contain"
          />
        )}
      </div>
      <p className={cn('text-xs font-bold tracking-wide uppercase', style.text)}>
        {RARITY_NAMES[o.rarity]}
      </p>
      <DialogTitle className="text-xl">{item?.name ?? o.itemKey}</DialogTitle>
      <DialogDescription>
        {o.isNew ? 'New in your collection!' : 'Another one for your collection.'}
      </DialogDescription>
    </div>
  );
}

function ManyResults({ results }: { results: Opened[] }) {
  const sorted = [...results].sort((a, b) => rank(b.rarity) - rank(a.rarity));
  const fresh = results.filter((r) => r.isNew).length;
  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      <DialogTitle className="text-xl">{results.length} boxes opened</DialogTitle>
      <DialogDescription>
        {fresh === 0
          ? 'Nothing new this time.'
          : fresh === 1
            ? '1 new item.'
            : `${fresh} new items.`}
      </DialogDescription>
      <div className="grid max-h-[50dvh] w-full grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
        {sorted.map((o, i) => (
          <div
            key={o.boxId}
            className="animate-loot-reveal"
            style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}
          >
            <ItemTile itemKey={o.itemKey} count={1} isNew={o.isNew} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A collectible in the album: its sprite when owned, a silhouette when not. */
export function ItemTile({
  itemKey,
  count,
  isNew,
}: {
  itemKey: string;
  /** Copies owned; 0 shows the silhouette. */
  count: number;
  isNew?: boolean;
}) {
  const item = collectible(itemKey);
  if (!item) return null;
  const owned = count > 0;
  const style = RARITY_STYLE[item.rarity];
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-lg border-2 bg-card p-2 text-center',
        owned ? style.border : 'border-dashed border-border',
      )}
      title={
        owned
          ? `${item.name} · ${RARITY_NAMES[item.rarity]}`
          : `Not found yet · ${RARITY_NAMES[item.rarity]}`
      }
    >
      {count > 1 && (
        <span className="absolute top-1 right-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
          ×{count}
        </span>
      )}
      {isNew && (
        <span className="absolute top-1 left-1.5 rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          NEW
        </span>
      )}
      <img
        src={spriteUrl(item)}
        alt=""
        loading="lazy"
        className={cn('h-16 w-16 object-contain', !owned && 'opacity-25 brightness-0 dark:invert')}
      />
      <span className={cn('line-clamp-1 text-xs font-medium', !owned && 'text-muted-foreground')}>
        {owned ? item.name : '???'}
      </span>
      <span className={cn('text-[10px] font-semibold tracking-wide uppercase', style.text)}>
        {RARITY_NAMES[item.rarity]}
      </span>
    </div>
  );
}
