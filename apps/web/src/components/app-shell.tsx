import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Keyboard, LogOut, Plus, Search, Settings } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CommandPalette } from '@/components/command-palette';
import { EntityIcon } from '@/components/entity-icon';
import { FocusBar, FocusStartDialog } from '@/components/focus';
import { GameChip } from '@/components/game-header';
import { Logo } from '@/components/logo';
import { NAV } from '@/components/nav';
import { ProjectStatusProvider } from '@/components/project-status';
import { GlobalShortcuts } from '@/components/shortcuts';
import { StructureDialogs } from '@/components/structure-dialogs';
import { AreaSheet } from '@/components/area-sheet';
import { GoalSheet } from '@/components/goal-sheet';
import { TaskSheet } from '@/components/task-sheet';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isMac } from '@/hooks/use-hotkeys';
import { authClient } from '@/lib/auth-client';
import {
  areasQuery,
  projectsQuery,
  tasksQuery,
  type Area,
  type Me,
  type Project,
} from '@/lib/queries';
import { flushAll } from '@/lib/saver';
import { newArea, newProject, openPalette, setUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function AppShell({
  me,
  sheets,
  children,
}: {
  me: Me;
  /** Which detail sheet is open (search params). */
  sheets: { task?: string; goal?: string; area?: string };
  children: ReactNode;
}) {
  const { data: inbox } = useQuery(tasksQuery({ project: 'inbox', status: 'open' }));
  const inboxCount = inbox?.length ?? 0;

  return (
    <ProjectStatusProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
          <div className="px-5 py-5">
            <Logo />
          </div>
          <button
            onClick={() => openPalette('search')}
            className="mx-3 mb-3 flex items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-background"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Find or add…</span>
            <kbd className="font-mono text-[10px]">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className: 'bg-sidebar-accent !text-sidebar-accent-foreground',
                }}
                activeOptions={{ exact: to !== '/projects' }}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {to === '/inbox' && inboxCount > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">{inboxCount}</span>
                )}
              </Link>
            ))}
          </nav>
          <AreaTree />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b bg-background/85 px-4 backdrop-blur md:px-8">
            <Logo className="md:invisible" />
            <div className="flex items-center gap-1">
              <GameChip />
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Find"
                onClick={() => openPalette('search')}
              >
                <Search />
              </Button>
              <UserMenu me={me} />
            </div>
          </header>
          <FocusBar />
          <main className="flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">{children}</main>
        </div>

        {/* Phones: capture in one tap, above the bottom bar. */}
        <Button
          size="icon"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 size-12 rounded-full shadow-lg md:hidden"
          aria-label="New task"
          onClick={() => openPalette('capture')}
        >
          <Plus className="size-6" />
        </Button>

        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Main"
        >
          {NAV.filter((n) => n.phone).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: '!text-primary' }}
              activeOptions={{ exact: to !== '/projects' }}
            >
              <Icon className="size-5" />
              {label}
              {to === '/inbox' && inboxCount > 0 && (
                <span className="absolute top-1 left-[calc(50%+6px)] rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
                  {inboxCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      <TaskSheet taskId={sheets.task} />
      <GoalSheet goalId={sheets.goal} />
      <AreaSheet areaId={sheets.area} />
      <CommandPalette />
      <FocusStartDialog />
      <StructureDialogs />
      <GlobalShortcuts />
    </ProjectStatusProvider>
  );
}

/** Areas with their active and parked projects. */
function AreaTree() {
  const { data: areas = [] } = useQuery(areasQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const open = projects.filter((p) => p.status === 'active' || p.status === 'parked');
  const loose = open.filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId));

  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-6 pb-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Areas
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="New area or project">
              <Plus className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => newProject()}>New project</DropdownMenuItem>
            <DropdownMenuItem onSelect={newArea}>New area</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {areas
          .filter((a) => !a.archivedAt)
          .map((a) => (
            <AreaBranch key={a.id} area={a} projects={open.filter((p) => p.areaId === a.id)} />
          ))}
        {loose.length > 0 && (
          <div className="mt-1">
            {areas.length > 0 && (
              <div className="px-3 py-1 text-xs text-muted-foreground">No area</div>
            )}
            {loose.map((p) => (
              <ProjectLink key={p.id} project={p} />
            ))}
          </div>
        )}
        {areas.length === 0 && projects.length === 0 && (
          <button
            onClick={() => newProject()}
            className="mx-3 mt-1 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            Start with a project →
          </button>
        )}
      </div>
    </div>
  );
}

function AreaBranch({ area, projects }: { area: Area; projects: Project[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-0.5">
      <div className="group flex items-center rounded-md hover:bg-sidebar-accent">
        <button
          className="grid size-7 place-items-center text-muted-foreground"
          aria-label={open ? `Collapse ${area.title}` : `Expand ${area.title}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <Link
          to="/projects"
          hash={area.id}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-sm font-medium"
        >
          <EntityIcon icon={area.icon} color={area.color} size="sm" />
          <span className="truncate">{area.title}</span>
        </Link>
      </div>
      {open && (
        <div className="ml-3.5 border-l border-sidebar-border pl-1">
          {projects.map((p) => (
            <ProjectLink key={p.id} project={p} />
          ))}
          {projects.length === 0 && (
            <button
              onClick={() => newProject(area.id)}
              className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              + Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectLink({ project }: { project: Project }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent',
        project.status === 'parked' && 'text-muted-foreground',
      )}
      activeProps={{ className: 'bg-sidebar-accent !text-sidebar-accent-foreground font-medium' }}
    >
      <EntityIcon icon={project.icon} color={project.color} size="sm" />
      <span className="min-w-0 flex-1 truncate">{project.title}</span>
      {project.status === 'parked' && (
        <span className="text-[10px] text-muted-foreground uppercase">parked</span>
      )}
    </Link>
  );
}

function UserMenu({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initials = me.user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await flushAll();
    const { error } = await authClient.signOut();
    if (error) {
      toast.error(error.message ?? 'Couldn’t sign out.');
      return;
    }
    queryClient.clear();
    await navigate({ to: '/sign-in' });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {initials || '?'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{me.user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: '/settings' })}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setUi({ shortcuts: true })}>
          <Keyboard />
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
