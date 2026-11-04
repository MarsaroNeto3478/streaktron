// App-wide shortcuts and the "?" help listing them.

import { useNavigate } from '@tanstack/react-router';
import { Fragment } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isMac, useHotkeys } from '@/hooks/use-hotkeys';
import { openPalette, setUi, startFocus, useUi } from '@/lib/ui-store';

const MOD = isMac ? '⌘' : 'Ctrl';

const SECTIONS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Anywhere',
    keys: [
      [`${MOD} K`, 'Command palette: find, jump, run'],
      ['C', 'New task (quick capture)'],
      ['F', 'Start a focus session'],
      ['G then T', 'Go to Today'],
      ['G then I', 'Go to Inbox'],
      ['G then P', 'Go to Projects'],
      ['G then L', 'Go to all tasks (list)'],
      ['G then S', 'Go to Settings'],
      ['G then A', 'Go to Stats'],
      ['?', 'This list'],
    ],
  },
  {
    title: 'Lists and boards',
    keys: [
      ['J / K or ↓ / ↑', 'Next / previous task'],
      ['Enter', 'Open the task'],
      ['X', 'Complete or reopen'],
      ['Space', 'Board: pick up a card, arrows to move it, Space to drop'],
      ['Esc', 'Close the panel or dialog'],
    ],
  },
];

export function GlobalShortcuts() {
  const navigate = useNavigate();
  const ui = useUi();
  useHotkeys({
    'mod+k': () => (ui.palette ? setUi({ palette: null }) : openPalette('search')),
    c: () => openPalette('capture'),
    f: () => startFocus(),
    '?': () => setUi({ shortcuts: true }),
    'g t': () => void navigate({ to: '/today' }),
    'g i': () => void navigate({ to: '/inbox' }),
    'g p': () => void navigate({ to: '/projects' }),
    'g l': () => void navigate({ to: '/tasks' }),
    'g s': () => void navigate({ to: '/settings' }),
    'g a': () => void navigate({ to: '/stats' }),
  });

  return (
    <Dialog open={ui.shortcuts} onOpenChange={(o) => setUi({ shortcuts: o })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you aren’t typing in a field.</DialogDescription>
        </DialogHeader>
        {SECTIONS.map((s) => (
          <section key={s.title} className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {s.title}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {s.keys.map(([k, what]) => (
                <Fragment key={k}>
                  <dt>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {k}
                    </kbd>
                  </dt>
                  <dd className="text-muted-foreground">{what}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
