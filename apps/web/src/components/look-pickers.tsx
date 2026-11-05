import { COLORS, ICONS, type ColorKey, type IconKey } from '@strekatron/shared/structure';
import { Check } from 'lucide-react';
import { COLOR, ICON } from '@/lib/look';
import { cn } from '@/lib/utils';

export function ColorPicker({
  value,
  onChange,
}: {
  value: ColorKey;
  onChange: (c: ColorKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            'grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background transition',
            COLOR[c].dot,
            value === c ? 'ring-2 ring-ring' : 'hover:scale-110',
          )}
        >
          {value === c && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: IconKey;
  color: ColorKey;
  onChange: (i: IconKey) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10" role="radiogroup" aria-label="Icon">
      {ICONS.map((i) => {
        const Icon = ICON[i];
        const on = value === i;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={i}
            onClick={() => onChange(i)}
            className={cn(
              'grid size-8 place-items-center rounded-md transition',
              on ? COLOR[color].tile : 'text-muted-foreground hover:bg-muted',
              on && 'ring-2 ring-ring',
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
