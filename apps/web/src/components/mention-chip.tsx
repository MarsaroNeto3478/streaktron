// A mention (D4) as a chip: the target's current title and icon, so renames show everywhere.
// Hovering previews it; clicking opens it. A target deleted for good (or soft-deleted) shows as a
// broken link with the label it had when it was mentioned.

import { linkableKind } from '@strekatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { Unlink } from 'lucide-react';
import { HoverCard } from 'radix-ui';
import { useOpenEntity } from '@/hooks/use-open-task';
import { entityQuery, KIND_LABEL, type ResolvedEntity } from '@/lib/entities';
import { STATUS_LABEL } from '@/lib/look';
import { cn } from '@/lib/utils';
import { RefIcon } from './entity-icon';

export function MentionChip({ id, label }: { id: string; label?: string | null }) {
  const kind = linkableKind(id);
  const { data, isPending } = useQuery({ ...entityQuery(id), enabled: kind !== null });
  const open = useOpenEntity();
  const broken = !kind || (!isPending && (!data || data.deleted));
  const title = data?.title ?? label ?? 'Unknown';

  const chip = (
    <button
      type="button"
      data-mention={id}
      className={cn(
        'mx-px inline-flex max-w-full items-baseline gap-1 rounded-md px-1 align-baseline text-[0.95em] font-medium',
        '[&_svg]:size-3.5 [&_svg]:self-center [&>span:first-child]:size-4 [&>span:first-child]:rounded-[4px] [&>span:first-child]:self-center',
        broken
          ? 'cursor-default bg-muted text-muted-foreground line-through decoration-muted-foreground/60'
          : 'cursor-pointer bg-accent/70 text-accent-foreground hover:bg-accent',
        !broken && data?.closed && 'text-muted-foreground',
      )}
      onClick={(e) => {
        e.preventDefault();
        if (!broken && kind) open({ kind, id });
      }}
      aria-label={broken ? `Broken link: ${title}` : `${KIND_LABEL[kind]}: ${title}`}
    >
      {broken ? <Unlink aria-hidden /> : <RefIcon entity={data ?? { kind }} />}
      <span className="truncate">{title}</span>
    </button>
  );

  return (
    <HoverCard.Root openDelay={350} closeDelay={80}>
      <HoverCard.Trigger asChild>{chip}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-72 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <Preview entity={data} label={title} broken={broken} pending={isPending} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function Preview({
  entity,
  label,
  broken,
  pending,
}: {
  entity: ResolvedEntity | null | undefined;
  label: string;
  broken: boolean;
  pending: boolean;
}) {
  if (pending) return <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />;
  if (!entity || broken) {
    return (
      <div className="space-y-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {entity?.deleted
            ? `This ${KIND_LABEL[entity.kind].toLowerCase()} was deleted. Undo or restore it to bring the link back.`
            : 'What this pointed to was deleted.'}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <RefIcon entity={entity} className="mt-0.5" />
        <p className="min-w-0 flex-1 leading-snug font-medium">{entity.title}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {KIND_LABEL[entity.kind]}
        {entity.context && <> · {entity.context}</>}
        {statusText(entity) && <> · {statusText(entity)}</>}
      </p>
      {entity.preview && (
        <p className="line-clamp-4 text-xs whitespace-pre-line text-muted-foreground">
          {entity.preview}
        </p>
      )}
    </div>
  );
}

function statusText(e: ResolvedEntity): string | null {
  if (e.kind === 'task') return e.status === 'done' ? 'Done' : null;
  if (e.kind === 'goal')
    return e.status === 'open' ? null : e.status === 'achieved' ? 'Achieved' : 'Dropped';
  if (e.kind === 'project') return STATUS_LABEL[e.status as keyof typeof STATUS_LABEL] ?? null;
  return e.status === 'archived' ? 'Archived' : null;
}
