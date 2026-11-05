import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCode,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { EntityIcon } from '@/components/entity-icon';
import { ProjectCard } from '@/components/project-card';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStructureActions } from '@/lib/actions';
import { areasQuery, meQuery, projectsQuery, type Area, type Project } from '@/lib/queries';
import { editArea, newArea, newProject } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/projects/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(areasQuery),
      context.queryClient.ensureQueryData(projectsQuery),
    ]),
  component: ProjectsPage,
});

// Dragging: areas reorder by their grip; projects in progress (active and parked) are cards that
// drag within an area or into another one (or out of every area), like cards on a board. Mouse,
// touch (a short press) and keyboard (Space to pick up, arrows, Space to drop).

/** The lane of projects without an area. */
const NONE = 'none';
const LANE = 'lane:';

/** Projects in progress of each lane (open area ids and NONE), in order. */
type Lanes = Record<string, string[]>;

const inProgress = (p: Project) => p.status === 'active' || p.status === 'parked';
const byOrder = (a: Project, b: Project) =>
  a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

function lanesOf(open: Area[], projects: Project[]): Lanes {
  const lanes: Lanes = { [NONE]: [] };
  for (const a of open) lanes[a.id] = [];
  for (const p of [...projects].sort(byOrder)) {
    if (!inProgress(p)) continue;
    const key = p.areaId && p.areaId in lanes ? p.areaId : NONE;
    lanes[key]!.push(p.id);
  }
  return lanes;
}

/** The lane an id is in: a lane's own droppable id, or a project card in it. */
function laneOf(lanes: Lanes, id: string): string | undefined {
  if (id.startsWith(LANE)) return id.slice(LANE.length);
  return Object.keys(lanes).find((k) => lanes[k]!.includes(id));
}

const keyboardCodes = {
  start: ['Space'] as KeyboardCode[],
  cancel: ['Escape'] as KeyboardCode[],
  end: ['Space'] as KeyboardCode[],
};

/**
 * Areas only collide with areas. Projects collide with what's under the pointer, or (keyboard:
 * no pointer) with what the dragged card overlaps; a card there wins over the lane it's in. Lanes
 * are much wider than cards, so "closest corners" alone picks the wrong one.
 */
const collide: CollisionDetection = (args) => {
  const area = args.active.data.current?.type === 'area';
  const scoped = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => (c.data.current?.type === 'area') === area,
    ),
  };
  if (area) return closestCorners(scoped);
  const pointed = pointerWithin(scoped);
  const hits = pointed.length ? pointed : rectIntersection(scoped);
  const cards = hits.filter((h) => !String(h.id).startsWith(LANE));
  return cards.length ? cards : hits.length ? hits : closestCorners(scoped);
};

function ProjectsPage() {
  const { data: areas = [] } = useQuery(areasQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes }),
  );
  const open = useMemo(() => areas.filter((a) => !a.archivedAt), [areas]);
  const archived = areas.filter((a) => a.archivedAt);
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const serverLanes = useMemo(() => lanesOf(open, projects), [open, projects]);
  // While a project is dragged, the lanes as the user is arranging them.
  const [dragLanes, setDragLanes] = useState<Lanes | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lanes = dragLanes ?? serverLanes;
  const closedOf = (areaId: string | null) =>
    projects.filter(
      (p) =>
        !inProgress(p) &&
        (areaId ? p.areaId === areaId : !p.areaId || !areas.some((a) => a.id === p.areaId)),
    );
  const looseClosed = closedOf(null);
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const limit = me?.settings.activeProjectLimit ?? 3;
  const today = me?.today ?? '';
  const dragged = activeId ? byId.get(activeId) : undefined;

  function onDragStart({ active }: DragStartEvent) {
    if (active.data.current?.type !== 'project') return;
    setActiveId(String(active.id));
    setDragLanes(serverLanes);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.type !== 'project') return;
    setDragLanes((current) => {
      const l = current ?? serverLanes;
      const from = laneOf(l, String(active.id));
      const to = laneOf(l, String(over.id));
      if (!from || !to || from === to) return current;
      const target = l[to]!;
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex === -1 ? target.length : overIndex;
      return {
        ...l,
        [from]: l[from]!.filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (active.data.current?.type === 'area') {
      if (!over || active.id === over.id) return;
      const ids = areas.map((a) => a.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1) void actions.reorderAreas(arrayMove(ids, from, to));
      return;
    }
    const l = dragLanes ?? serverLanes;
    setActiveId(null);
    setDragLanes(null);
    const id = String(active.id);
    const project = byId.get(id);
    if (!over || !project) return;
    const to = laneOf(l, String(over.id));
    if (!to) return;
    // As on the board: over a card, take its place; over the lane's empty space, stay where
    // dragOver put it (or go last).
    const full = l[to]!;
    const lane = full.filter((x) => x !== id);
    const overIndex = full.indexOf(String(over.id));
    const own = full.indexOf(id);
    const index = overIndex !== -1 ? overIndex : own !== -1 ? own : lane.length;
    if (laneOf(serverLanes, id) === to && serverLanes[to]?.indexOf(id) === index) return;
    void actions.moveProject(
      project,
      to === NONE ? null : to,
      index,
      lane.map((x) => byId.get(x)!).filter(Boolean),
    );
  }

  // "No area" shows when it has something, and while a project is dragged (to drop it there).
  const showLoose =
    lanes[NONE]!.length > 0 || looseClosed.length > 0 || (!!activeId && areas.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Projects"
        description={
          <>
            <span className={cn(activeCount >= limit && 'font-medium text-foreground')}>
              {activeCount} of {limit} active
            </span>
            {' · '}A short active list is the point: park what can wait.
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={newArea}>
              New area
            </Button>
            <Button onClick={() => newProject()}>
              <Plus />
              New project
            </Button>
          </>
        }
      />

      {areas.length === 0 && projects.length === 0 && (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">Start with what you’re working on.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Areas are long-lived parts of your life (University, Side projects). Projects live in
            them, each with goals, tasks and a board.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={newArea}>
              New area
            </Button>
            <Button onClick={() => newProject()}>New project</Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setDragLanes(null);
        }}
      >
        <SortableContext items={open.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {open.map((a) => (
            <SortableArea key={a.id} area={a}>
              <ProjectGrid
                lane={a.id}
                ids={lanes[a.id] ?? []}
                byId={byId}
                closed={closedOf(a.id)}
                today={today}
                areaId={a.id}
              />
            </SortableArea>
          ))}
        </SortableContext>

        {showLoose && (
          <section className="space-y-3">
            {areas.length > 0 && (
              <h2 className="text-sm font-semibold text-muted-foreground">No area</h2>
            )}
            <ProjectGrid
              lane={NONE}
              ids={lanes[NONE]!}
              byId={byId}
              closed={looseClosed}
              today={today}
              areaId={null}
            />
          </section>
        )}

        <DragOverlay dropAnimation={null}>
          {dragged && <ProjectCard project={dragged} today={today} overlay />}
        </DragOverlay>
      </DndContext>

      {archived.length > 0 && (
        <Collapsible label={`Archived areas (${archived.length})`}>
          {archived.map((a) => (
            <AreaSection key={a.id} area={a}>
              <ProjectGrid
                ids={projects
                  .filter((p) => p.areaId === a.id && inProgress(p))
                  .sort(byOrder)
                  .map((p) => p.id)}
                byId={byId}
                closed={closedOf(a.id)}
                today={today}
                areaId={a.id}
              />
            </AreaSection>
          ))}
        </Collapsible>
      )}
    </div>
  );
}

function SortableArea({ area, children }: { area: Area; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: area.id,
    data: { type: 'area' },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('mb-8', isDragging && 'relative z-10 opacity-80')}
    >
      <AreaSection
        area={area}
        handle={
          <button
            className="-ml-1 grid size-7 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label={`Reorder ${area.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
      >
        {children}
      </AreaSection>
    </div>
  );
}

function AreaSection({
  area,
  handle,
  children,
}: {
  area: Area;
  handle?: ReactNode;
  children: ReactNode;
}) {
  const actions = useStructureActions();
  const { data: projects = [] } = useQuery(projectsQuery);
  const [deleting, setDeleting] = useState(false);
  const count = projects.filter((p) => p.areaId === area.id).length;

  return (
    <section id={area.id} className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-2">
        {handle}
        <EntityIcon icon={area.icon} color={area.color} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
          <Link
            to="/areas/$areaId"
            params={{ areaId: area.id }}
            className="block max-w-full truncate hover:underline"
          >
            {area.title}
          </Link>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => newProject(area.id)}>
          <Plus />
          <span className="hidden sm:inline">Project</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${area.title} menu`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => editArea(area.id)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void actions.updateArea(area.id, { archived: !area.archivedAt })}
            >
              {area.archivedAt ? <ArchiveRestore /> : <Archive />}
              {area.archivedAt ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{area.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {count === 0
                ? 'The area is empty.'
                : `It has ${count} project${count === 1 ? '' : 's'}. Keep them (they move to “No area”) or delete them with it.`}{' '}
              You can restore it from Settings for 30 days. To just put it away, archive it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {count > 0 && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleting(false);
                  void actions.deleteArea(area, 'delete');
                }}
              >
                Delete with projects
              </Button>
            )}
            <Button
              variant={count > 0 ? 'outline' : 'destructive'}
              onClick={() => {
                setDeleting(false);
                void actions.deleteArea(area, 'keep');
              }}
            >
              {count > 0 ? 'Delete, keep projects' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * The projects of an area: those in progress as cards (draggable when `lane` is given), then the
 * completed and archived ones folded away.
 */
function ProjectGrid({
  lane,
  ids,
  byId,
  closed,
  today,
  areaId,
}: {
  lane?: string;
  ids: string[];
  byId: Map<string, Project>;
  closed: Project[];
  today: string;
  areaId: string | null;
}) {
  const current = ids.map((id) => byId.get(id)).filter((p): p is Project => !!p);
  const sortedClosed = [...closed].sort(byOrder);
  return (
    <div className="space-y-3">
      {lane ? (
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <Lane lane={lane}>
            {current.map((p) => (
              <SortableProject key={p.id} project={p} today={today} />
            ))}
            {current.length === 0 && <EmptyLane areaId={areaId} />}
          </Lane>
        </SortableContext>
      ) : current.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((p) => (
            <ProjectCard key={p.id} project={p} today={today} />
          ))}
        </div>
      ) : (
        <EmptyLane areaId={areaId} />
      )}
      {sortedClosed.length > 0 && (
        <Collapsible label={`Completed & archived (${sortedClosed.length})`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedClosed.map((p) => (
              <ProjectCard key={p.id} project={p} today={today} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

/** Where cards can be dropped, even when it's empty. */
function Lane({ lane, children }: { lane: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE}${lane}`, data: { type: 'lane' } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'grid min-h-16 gap-3 rounded-xl transition-colors sm:grid-cols-2 lg:grid-cols-3',
        isOver && 'bg-muted/40',
      )}
    >
      {children}
    </div>
  );
}

function EmptyLane({ areaId }: { areaId: string | null }) {
  return (
    <button
      onClick={() => newProject(areaId)}
      className="w-full rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-muted/40 sm:col-span-2 lg:col-span-3"
    >
      No projects in progress. Add one, or drag one here.
    </button>
  );
}

function SortableProject({ project, today }: { project: Project; today: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { type: 'project' },
  });
  const navigate = useNavigate();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
      return;
    }
    listeners?.onKeyDown?.(e);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isDragging && 'opacity-40',
      )}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-roledescription="Draggable project"
      aria-label={project.title}
    >
      <ProjectCard project={project} today={today} focusable={false} />
    </div>
  );
}

function Collapsible({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && children}
    </div>
  );
}
