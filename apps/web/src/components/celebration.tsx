// The burst when a quest is done or a level reached (D33): a ring of particles and a short badge
// near the top of the screen, gone in under two seconds. Never blocks clicks.

import { useEffect, useState } from 'react';
import { useBurst } from '@/lib/game';
import { cn } from '@/lib/utils';

const PARTICLES = 18;

export function Celebration() {
  const burst = useBurst();
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!burst) return;
    const show = setTimeout(() => setShown(burst.id), 0);
    const hide = setTimeout(() => setShown(null), 1900);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [burst]);

  if (!burst || shown !== burst.id) return null;
  const level = burst.kind === 'level';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 h-0" aria-hidden>
      <div className="absolute left-1/2">
        {Array.from({ length: PARTICLES }, (_, i) => {
          const angle = (i / PARTICLES) * Math.PI * 2;
          const dist = (level ? 90 : 64) + (i % 3) * 14;
          return (
            <span
              key={`${burst.id}-${i}`}
              className={cn(
                'animate-burst-particle absolute size-2 rounded-full',
                i % 3 === 0 ? 'bg-amber-400' : i % 3 === 1 ? 'bg-primary' : 'bg-sky-400',
              )}
              style={
                {
                  '--dx': `${Math.cos(angle) * dist}px`,
                  '--dy': `${Math.sin(angle) * dist}px`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>
      <div
        className={cn(
          'animate-burst-badge absolute left-1/2 rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap shadow-lg',
          level ? 'bg-amber-400 text-amber-950' : 'bg-primary text-primary-foreground',
        )}
      >
        {level ? '★ ' : '✓ '}
        {burst.text}
      </div>
    </div>
  );
}
