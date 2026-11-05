// "Mentioned in…" (D4): what mentions this entity, grouped by kind, with the line each mention is
// in. Shown on every task, goal, area and project.

import type { LinkableKind } from '@strekatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { useOpenEntity } from '@/hooks/use-open-task';
import { backlinksQuery, KIND_PLURAL, type Backlink } from '@/lib/entities';
import { cn } from '@/lib/utils';
import { RefIcon } from './entity-icon';

const ORDER: LinkableKind[] = ['task', 'goal', 'project', 'area'];

export function Backlinks({ id, className }: { id: string; className?: string }) {
  const { data: links, isPending } = useQuery(backlinksQuery(id));
  const open = useOpenEntity();

  return (
    <section className={cn('grid gap-2', className)} aria-label="Mentioned in">
      <h3 className="flex items-baseline gap-2 text-sm font-medium text-muted-foreground">
        Mentioned in
        {links && links.length > 0 && <span className="text-xs font-normal">{links.length}</span>}
      </h3>
      {isPending ? (
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      ) : !links?.length ? (
        <p className="text-xs text-muted-foreground">
          Nothing links here yet. Type @ in any description to mention this.
        </p>
      ) : (
        ORDER.map((kind) => {
          const group = links.filter((l) => l.kind === kind);
          if (!group.length) return null;
          return (
            <div key={kind} className="grid gap-0.5">
              <h4 className="text-xs font-medium text-muted-foreground/80">{KIND_PLURAL[kind]}</h4>
              <ul className="-mx-2 grid">
                {group.map((l) => (
                  <BacklinkRow key={l.id} link={l} onOpen={() => open(l)} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function BacklinkRow({ link, onOpen }: { link: Backlink; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_1fr] items-start gap-x-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
      >
        <RefIcon entity={link} className="mt-0.5" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate font-medium',
                link.closed && 'text-muted-foreground line-through',
              )}
            >
              {link.title}
            </span>
            {link.context && (
              <span className="shrink-0 truncate text-xs text-muted-foreground">
                {link.context}
              </span>
            )}
          </span>
          {link.snippet && (
            <span className="line-clamp-2 text-xs text-muted-foreground">{link.snippet}</span>
          )}
        </span>
      </button>
    </li>
  );
}
