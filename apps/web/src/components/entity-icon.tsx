import type { LinkableKind } from '@strekatron/shared/rich';
import type { ColorKey, IconKey } from '@strekatron/shared/structure';
import { CheckCircle2, CircleDashed, Folder, Shapes, Target } from 'lucide-react';
import { COLOR, ICON } from '@/lib/look';
import { cn } from '@/lib/utils';

/** An area's or project's icon on its color. */
export function EntityIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: IconKey;
  color: ColorKey;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = ICON[icon] ?? ICON.folder;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md',
        COLOR[color]?.tile ?? COLOR.stone.tile,
        size === 'sm' && 'size-5 [&>svg]:size-3',
        size === 'md' && 'size-7 [&>svg]:size-4',
        size === 'lg' && 'size-10 rounded-lg [&>svg]:size-5',
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

/** The icon of anything mentionable: an area's or project's own, else its kind's. */
export function RefIcon({
  entity,
  className,
}: {
  entity: {
    kind: LinkableKind;
    icon?: IconKey | null;
    color?: ColorKey | null;
    closed?: boolean;
  };
  className?: string;
}) {
  if (entity.icon && entity.color) {
    return <EntityIcon icon={entity.icon} color={entity.color} size="sm" className={className} />;
  }
  const Icon =
    entity.kind === 'goal'
      ? Target
      : entity.kind === 'area'
        ? Shapes
        : entity.kind === 'project'
          ? Folder
          : entity.closed
            ? CheckCircle2
            : CircleDashed;
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} aria-hidden />;
}
