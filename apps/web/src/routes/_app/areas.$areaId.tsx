// An area's own page (opened from the sidebar or the Projects page): its description, how its
// projects are doing, and the projects themselves by status. Editing the details happens in the
// area sheet, which opens from here.

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, FileText, Palette, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EntityIcon } from '@/components/entity-icon';
import { ProjectCard } from '@/components/project-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOpenSheet } from '@/hooks/use-open-task';
import { areasQuery, meQuery, projectsQuery, type Project } from '@/lib/queries';
import { editArea, newProject } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/areas/$areaId')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(areasQuery),
      context.queryClient.ensureQueryData(projectsQuery),
    ]),
  component: AreaPage,
});

const byOrder = (a: Project, b: Project) => a.sortOrder - b.sortOrder;

function AreaPage() {
  const { areaId } = Route.useParams();
  const { data: areas = [] } = useQuery(areasQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: me } = useQuery(meQuery);
  const openSheet = useOpenSheet();
  const area = areas.find((a) => a.id === areaId);

  if (!area) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-10 text-center">
        <p className="font-medium">That area doesn’t exist anymore.</p>
        <Button asChild variant="outline">
          <Link to="/projects">Go to Projects</Link>
        </Button>
      </div>
    );
  }

  const today = me?.today ?? '';
  const own = projects.filter((p) => p.areaId === area.id).sort(byOrder);
  const active = own.filter((p) => p.status === 'active');
  const parked = own.filter((p) => p.status === 'parked');
  const closed = own.filter((p) => p.status === 'completed' || p.status === 'archived');
  const open = own.filter((p) => p.status === 'active' || p.status === 'parked');
  const done = open.reduce((n, p) => n + p.counts.done, 0);
  const total = open.reduce((n, p) => n + p.counts.open + p.counts.done, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/projects" className="hover:text-foreground hover:underline">
            Projects
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="truncate">{area.title}</span>
        </nav>
        <div className="flex flex-wrap items-start gap-3">
          <EntityIcon icon={area.icon} color={area.color} className="mt-1" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="truncate">{area.title}</span>
              {area.archivedAt && <Badge variant="secondary">Archived</Badge>}
            </h1>
            {area.descriptionText ? (
              <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
                {area.descriptionText}
              </p>
            ) : (
              <button
                className="mt-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => openSheet('area', area.id)}
              >
                Add a description
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openSheet('area', area.id)}>
              <FileText /> Details
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Color and icon"
              onClick={() => editArea(area.id)}
            >
              <Palette />
            </Button>
            <Button size="sm" onClick={() => newProject(area.id)}>
              <Plus /> Project
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active" value={active.length} />
          <Stat label="Parked" value={parked.length} />
          <Stat label="Completed" value={own.filter((p) => p.status === 'completed').length} />
          <Stat label="Tasks done" value={total ? `${done}/${total}` : '–'}>
            {total > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(done / total) * 100}%` }}
                />
              </div>
            )}
          </Stat>
        </div>
      </div>

      {own.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No projects here yet.{' '}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => newProject(area.id)}
          >
            Start one
          </button>
          .
        </div>
      ) : (
        <>
          <Group title="Active" projects={active} today={today} empty="Nothing active right now." />
          {parked.length > 0 && <Group title="Parked" projects={parked} today={today} />}
          {closed.length > 0 && (
            <Group
              title={`Completed and archived (${closed.length})`}
              projects={closed}
              today={today}
              folded
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {children}
    </div>
  );
}

function Group({
  title,
  projects,
  today,
  empty,
  folded = false,
}: {
  title: string;
  projects: Project[];
  today: string;
  empty?: string;
  folded?: boolean;
}) {
  const [open, setOpen] = useState(!folded);
  return (
    <section className="space-y-3">
      <button
        className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      {open &&
        (projects.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} today={today} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ))}
    </section>
  );
}
