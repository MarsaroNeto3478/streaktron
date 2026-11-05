import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-bold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-foreground" />
        <path d="M17.5 4 9 18h6l-1.5 10L23 13h-6.2z" className="fill-primary" />
      </svg>
      Strekatron
    </span>
  );
}
