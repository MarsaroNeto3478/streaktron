// The top bar's word on the connection (D55): shown only when something is off. Offline, with
// how many changes wait on this device; "Syncing" while they go; or changes still waiting while
// online (signed out, or the server failing).

import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useOutbox } from '@/lib/outbox';
import { cn } from '@/lib/utils';

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

export function OfflineChip() {
  const { connection, pending } = useOutbox();
  if (connection === 'online' && !pending) return null;

  const [Icon, text, label] =
    connection === 'syncing'
      ? [RefreshCw, 'Syncing', `Syncing ${changes(pending)} made offline`]
      : connection === 'offline'
        ? [
            CloudOff,
            pending ? `Offline · ${pending}` : 'Offline',
            pending
              ? `Offline. ${changes(pending)} saved on this device, sent when the server is back`
              : 'Offline. Showing what was last loaded',
          ]
        : [CloudUpload, `${pending} waiting`, `${changes(pending)} waiting to sync`];

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        'mr-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
        connection === 'offline'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className={cn('size-3.5', connection === 'syncing' && 'animate-spin')} />
      {text}
    </span>
  );
}
