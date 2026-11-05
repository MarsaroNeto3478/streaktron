// Streaky, the guide mascot (D31): the user's drawings as animated SVGs in /public/streaky. Each
// mood is its own file; `icon` is the small version for 16–48 px.

import { cn } from '@/lib/utils';

export type StreakyMood = 'happy' | 'celebrating' | 'worried' | 'thinking' | 'icon';

const FILE: Record<StreakyMood, string> = {
  happy: 'streaky.svg',
  celebrating: 'streaky-comemorando.svg',
  worried: 'streaky-preocupado.svg',
  thinking: 'streaky-pensativo.svg',
  icon: 'streaky-icone.svg',
};

export function Streaky({
  mood = 'happy',
  size = 96,
  className,
}: {
  mood?: StreakyMood;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={`/streaky/${FILE[mood]}`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  );
}
