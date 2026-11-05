// An inline "add a task" field: Enter adds and keeps the field open for the next one.

import type { TaskCreate } from '@strekatron/shared/schemas';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTaskActions } from '@/lib/actions';
import { cn } from '@/lib/utils';

export function QuickAdd({
  input,
  placeholder = 'Add a task',
  className,
  autoFocus,
  onAdded,
}: {
  /** Where the new task goes (project, column, parent, position). */
  input: Omit<TaskCreate, 'title'>;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onAdded?: (id: string) => void;
}) {
  const tasks = useTaskActions();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function add() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const created = await tasks.create({ ...input, title: t });
    setBusy(false);
    if (created) {
      setTitle('');
      onAdded?.(created.id);
      ref.current?.focus();
    }
  }

  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground focus-within:bg-card focus-within:ring-1 focus-within:ring-ring/40 hover:bg-muted/60',
        className,
      )}
    >
      <Plus className="size-4 shrink-0" />
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={title}
        maxLength={200}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void add();
          } else if (e.key === 'Escape') {
            setTitle('');
            e.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
