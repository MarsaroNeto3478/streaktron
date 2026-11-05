// An area's details, in a side sheet opened by the `area` search param from anywhere: its
// description, its projects and what mentions it. Title and description save as you type.

import type { RichDoc } from '@strekatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useStructureActions } from '@/lib/actions';
import { useAutosave } from '@/lib/autosave';
import { STATUS_LABEL } from '@/lib/look';
import { areasQuery, projectsQuery, type Area } from '@/lib/queries';
import { editArea } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { Backlinks } from './backlinks';
import { EntityIcon } from './entity-icon';
import { RichEditor } from './rich-editor';
import { SheetBar, TitleField } from './sheet-parts';

export function AreaSheet({ areaId }: { areaId: string | undefined }) {
  const open = useOpenSheet();
  return (
    <Sheet open={!!areaId} onOpenChange={(o) => !o && open('area', undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {areaId && <AreaLoader areaId={areaId} />}
      </SheetContent>
    </Sheet>
  );
}

/** Mounted while the sheet is open: fetches the areas again, so the editor starts fresh. */
function AreaLoader({ areaId }: { areaId: string }) {
  const open = useOpenSheet();
  const { data: areas, isFetchedAfterMount } = useQuery({
    ...areasQuery,
    refetchOnMount: 'always',
  });
  const area = areas?.find((a) => a.id === areaId);
  const missing = isFetchedAfterMount && !area;

  useEffect(() => {
    if (missing) {
      toast.error('That area doesn’t exist anymore.');
      open('area', undefined);
    }
  }, [missing, open]);

  if (area && isFetchedAfterMount) return <AreaEditor key={area.id} area={area} />;
  return (
    <div className="p-6">
      <SheetTitle className="sr-only">Area</SheetTitle>
      <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

function AreaEditor({ area }: { area: Area }) {
  const actions = useStructureActions();
  const open = useOpenSheet();
  const { data: projects = [] } = useQuery(projectsQuery);
  const own = projects.filter((p) => p.areaId === area.id && p.status !== 'archived');

  const [title, setTitle] = useState(area.title);
  const [description, setDescription] = useState<RichDoc | null>(area.description);
  // Titles this sheet sent, to tell its own saves from a rename in the edit dialog.
  const sent = useRef(new Set([area.title]));
  const save = useAutosave(
    { title, description },
    (v) => {
      if (!v.title.trim()) return Promise.resolve();
      sent.current.add(v.title.trim());
      return actions.saveArea(area.id, v);
    },
    { what: 'the area' },
  );

  // Renamed in the edit dialog: take the new title.
  const { accept } = save;
  useEffect(() => {
    if (sent.current.has(area.title)) return;
    sent.current.add(area.title);
    setTitle(area.title);
    accept({ title: area.title, description });
    // Only a new title from outside matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.title]);

  return (
    <div className="flex min-h-full flex-col">
      <SheetBar status={save.status} onClose={() => open('area', undefined)}>
        <Link to="/projects" className="hover:underline">
          Area{area.archivedAt ? ' · archived' : ''}
        </Link>
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <EntityIcon icon={area.icon} color={area.color} className="mt-1" />
          <SheetTitle className="sr-only">{area.title}</SheetTitle>
          <SheetDescription className="sr-only">Area details</SheetDescription>
          <TitleField value={title} onChange={setTitle} what="area" />
          <Button
            variant="ghost"
            size="icon"
            className="mt-1"
            aria-label="Color and icon"
            onClick={() => editArea(area.id)}
          >
            <Palette />
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">Description</Label>
          <RichEditor
            aria-label="Description"
            value={area.description}
            onChange={setDescription}
            selfId={area.id}
            placeholder="What this part of your life is about… Type @ to link things."
          />
        </div>

        <section className="grid gap-1" aria-label="Projects in this area">
          <h3 className="text-sm font-medium text-muted-foreground">Projects</h3>
          {own.length ? (
            <ul className="-mx-2 grid">
              {own.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <EntityIcon icon={p.icon} color={p.color} size="sm" />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        p.status !== 'active' && 'text-muted-foreground',
                      )}
                    >
                      {p.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[p.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No projects in this area yet.</p>
          )}
        </section>

        <Backlinks id={area.id} />
      </div>
    </div>
  );
}
