import { PROJECT_TRANSITIONS, type ProjectStatus } from '@streaktron/shared/structure';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { RichDoc } from '@streaktron/shared/rich';
import { Backlinks } from '@/components/backlinks';
import { Board } from '@/components/board';
import { Countdowns } from '@/components/countdowns';
import { EntityIcon } from '@/components/entity-icon';
import { GoalsPanel } from '@/components/goals-panel';
import { QuickAdd } from '@/components/quick-add';
import { RichEditor } from '@/components/rich-editor';
import { SaveState } from '@/components/sheet-parts';
import { TaskListControls, TaskListView } from '@/components/task-list-view';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOpenTask } from '@/hooks/use-open-task';
import { useStructureActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { countdown, formatDayShort } from '@/lib/days';
import { STATUS_LABEL } from '@/lib/look';
import { useProjectStatus } from '@/lib/project-status';
import {
  areasQuery,
  meQuery,
  projectQuery,
  projectsQuery,
  tasksQuery,
  type Project,
} from '@/lib/queries';
import {
  DEFAULT_LIST,
  DUE_FILTERS,
  GROUPS,
  SORTS,
  STATUS_FILTERS,
  type ListOptions,
} from '@/lib/task-list';
import { editProject } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const search = z.object({
  view: z.enum(['board', 'list', 'overview']).optional(),
  status: z.enum(STATUS_FILTERS).optional(),
  due: z.enum(DUE_FILTERS).optional(),
  sort: z.enum(SORTS).optional(),
  group: z.enum(GROUPS).optional(),
});

export const Route = createFileRoute('/_app/projects/$projectId')({
  validateSearch: search,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(projectQuery(params.projectId)),
      context.queryClient.ensureQueryData(tasksQuery({ project: params.projectId })),
    ]);
  },
  component: ProjectPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <p className="font-medium">
        {error instanceof ApiError && error.status === 404
          ? 'This project doesn’t exist (it may have been deleted).'
          : 'This project couldn’t be loaded.'}
      </p>
      <Link to="/projects" className="mt-2 inline-block text-sm text-primary hover:underline">
        Back to projects
      </Link>
    </div>
  ),
});

const STATUS_ACTION: Record<ProjectStatus, { label: string; icon: ReactNode }> = {
  active: { label: 'Activate', icon: <CirclePlay /> },
  parked: { label: 'Park', icon: <CirclePause /> },
  completed: { label: 'Mark completed', icon: <CheckCircle2 /> },
  archived: { label: 'Archive', icon: <Archive /> },
};

function ProjectPage() {
  const { projectId } = Route.useParams();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: page } = useQuery(projectQuery(projectId));
  const { data: tasks = [] } = useQuery(tasksQuery({ project: projectId }));
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: me } = useQuery(meQuery);
  const today = me?.today ?? '';
  if (!page) return null;
  // The list in the projects query is refreshed with every task write; prefer it.
  const project = projects.find((p) => p.id === projectId) ?? page.project;
  const view = s.view ?? 'board';
  const listOptions: ListOptions = {
    ...DEFAULT_LIST,
    group: 'status',
    sort: 'board',
    ...s,
    project: projectId,
  };

  return (
    <div className={cn('mx-auto space-y-5', view === 'board' ? 'max-w-none' : 'max-w-4xl')}>
      <ProjectHeader project={project} today={today} />
      <NextAction project={project} />
      <Countdowns items={page.countdowns} today={today} />

      <Tabs
        value={view}
        onValueChange={(v) =>
          void navigate({ search: (prev) => ({ ...prev, view: v as typeof view }), replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="overview">Goals & details</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'board' && (
        <Board
          project={project}
          columns={page.columns}
          tasks={tasks}
          goals={page.goals}
          today={today}
        />
      )}

      {view === 'list' && (
        <div className="space-y-4">
          <TaskListControls
            options={listOptions}
            showProject={false}
            hideGroups={['project']}
            onChange={(o) =>
              void navigate({ search: (prev) => ({ ...prev, ...o }), replace: true })
            }
          />
          <QuickAdd input={{ projectId }} className="border bg-card" />
          <TaskListView
            tasks={tasks}
            options={listOptions}
            goals={page.goals}
            showProject={false}
            empty="No tasks match. Add one above."
          />
        </div>
      )}

      {view === 'overview' && (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <GoalsPanel projectId={projectId} goals={page.goals} tasks={tasks} today={today} />
          <Details key={project.id} project={project} today={today} />
        </div>
      )}
    </div>
  );
}

function ProjectHeader({ project, today }: { project: Project; today: string }) {
  const changeStatus = useProjectStatus();
  const actions = useStructureActions();
  const navigate = useNavigate();
  const { data: areas = [] } = useQuery(areasQuery);
  const area = areas.find((a) => a.id === project.areaId);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-3">
      <EntityIcon icon={project.icon} color={project.color} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {area ? (
            <Link to="/projects" hash={area.id} className="hover:underline">
              {area.title}
            </Link>
          ) : (
            <Link to="/projects" className="hover:underline">
              Projects
            </Link>
          )}
          {project.dueDate && (
            <>
              <span>·</span>
              <span className={cn(project.dueDate < today && 'text-destructive')}>
                {countdown(project.dueDate, today)}
              </span>
            </>
          )}
        </div>
        <h1 className="truncate text-2xl font-bold tracking-tight">{project.title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Badge
                variant={project.status === 'active' ? 'default' : 'secondary'}
                className="px-1.5 py-0 text-[10px]"
              >
                {STATUS_LABEL[project.status]}
              </Badge>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {PROJECT_TRANSITIONS[project.status].map((to) => (
              <DropdownMenuItem key={to} onSelect={() => void changeStatus(project, to)}>
                {project.status === 'archived' && to === 'parked' ? (
                  <>
                    <ArchiveRestore />
                    Unarchive (as parked)
                  </>
                ) : project.status === 'completed' && to === 'active' ? (
                  <>
                    <CirclePlay />
                    Reopen
                  </>
                ) : (
                  <>
                    {STATUS_ACTION[to].icon}
                    {STATUS_ACTION[to].label}
                  </>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => editProject(project.id)}>
              <Pencil />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {project.counts.open + project.counts.done} tasks, goals and board go with it. You
              can restore it from Settings for 30 days. To put it away instead, archive it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await navigate({ to: '/projects' });
                void actions.deleteProject(project);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NextAction({ project }: { project: Project }) {
  const open = useOpenTask();
  const actions = useStructureActions();
  if (project.status === 'completed' || project.status === 'archived') return null;
  const next = project.nextAction;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-accent/40 px-4 py-2.5">
      <Pin className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="mr-2 text-xs font-semibold tracking-wide text-accent-foreground uppercase">
          Next action
        </span>
        {next ? (
          <button className="font-medium hover:underline" onClick={() => open(next.id)}>
            {next.title}
          </button>
        ) : (
          <span className="text-muted-foreground">
            Add a task to the board; the top one becomes the next action.
          </span>
        )}
      </div>
      {next?.pinned && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => void actions.updateProject(project.id, { nextActionTaskId: null })}
        >
          <PinOff />
          Unpin
        </Button>
      )}
      {next && !next.pinned && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Picked from the board · pin another from its task
        </span>
      )}
    </div>
  );
}

function Details({ project, today }: { project: Project; today: string }) {
  return (
    <aside className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Details</h2>
        <Button variant="ghost" size="sm" onClick={() => editProject(project.id)}>
          <Pencil />
          Edit
        </Button>
      </div>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{STATUS_LABEL[project.status]}</dd>
        <dt className="text-muted-foreground">Start</dt>
        <dd>{project.startDate ? formatDayShort(project.startDate, today) : '—'}</dd>
        <dt className="text-muted-foreground">Due</dt>
        <dd>
          {project.dueDate
            ? `${formatDayShort(project.dueDate, today)} · ${countdown(project.dueDate, today)}`
            : '—'}
        </dd>
        <dt className="text-muted-foreground">Tasks</dt>
        <dd>
          {project.counts.open} open · {project.counts.done} done
        </dd>
      </dl>
      <ProjectDescription project={project} />
      <Backlinks id={project.id} />
    </aside>
  );
}

/** The description, edited in place and saved as you type. */
function ProjectDescription({ project }: { project: Project }) {
  const actions = useStructureActions();
  const [description, setDescription] = useState<RichDoc | null>(project.description);
  const save = useAutosave(
    description,
    (v) => actions.saveProject(project.id, { description: v }),
    { what: 'the description' },
  );
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-muted-foreground">Description</h3>
        {save.status !== 'saved' && <SaveState status={save.status} />}
      </div>
      <RichEditor
        aria-label="Project description"
        value={project.description}
        onChange={setDescription}
        selfId={project.id}
        placeholder="What is this project for? What does done look like? Type @ to link things."
      />
    </div>
  );
}
