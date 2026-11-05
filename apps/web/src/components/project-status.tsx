// Changing a project's status, with the hard active-project limit (D5): when activating would go
// over it, a dialog lists the active projects and parks the one you pick in the same step.

import type { ColorKey, IconKey } from '@strekatron/shared/structure';
import { Link } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { EntityIcon } from '@/components/entity-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStructureActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { STATUS_LABEL } from '@/lib/look';
import { ProjectStatusContext as Ctx, type ChangeStatus as Change } from '@/lib/project-status';
import { report } from '@/lib/report';

interface Over {
  project: { id: string; title: string };
  limit: number;
  active: { id: string; title: string; color: ColorKey; icon: IconKey }[];
}

export function ProjectStatusProvider({ children }: { children: ReactNode }) {
  const actions = useStructureActions();
  const [over, setOver] = useState<Over | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const change = useMemo<Change>(
    () => async (project, status) => {
      try {
        await actions.setStatus(project.id, status);
        toast.success(`“${project.title}” is ${STATUS_LABEL[status].toLowerCase()}`);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'active_limit') {
          const details = err.details as Omit<Over, 'project'>;
          setOver({ project, ...details });
        } else {
          report(err);
        }
        return false;
      }
    },
    [actions],
  );

  async function parkAndActivate(parkId: string) {
    if (!over) return;
    setBusy(parkId);
    try {
      await actions.setStatus(over.project.id, 'active', parkId);
      const parked = over.active.find((p) => p.id === parkId);
      toast.success(`“${over.project.title}” is active`, {
        description: parked ? `“${parked.title}” is parked.` : undefined,
      });
      setOver(null);
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Ctx.Provider value={change}>
      {children}
      <Dialog open={!!over} onOpenChange={(o) => !o && setOver(null)}>
        {over && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Park one to continue</DialogTitle>
              <DialogDescription>
                You have {over.active.length} active project{over.active.length === 1 ? '' : 's'}
                {', '}your limit. Park one to make room for “{over.project.title}”. Parked projects
                keep everything and come back any time.
              </DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2">
              {over.active.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <EntityIcon icon={p.icon} color={p.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void parkAndActivate(p.id)}
                  >
                    {busy === p.id ? 'Parking…' : 'Park'}
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter className="items-center sm:justify-between">
              <Link
                to="/settings"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setOver(null)}
              >
                Change the limit ({over.limit}) in Settings
              </Link>
              <Button variant="ghost" onClick={() => setOver(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}
