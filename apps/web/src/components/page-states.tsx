// The states every page shares (D53): loading (a skeleton, and a thin bar while the router waits for
// a page's data), failed, not found, and empty. One look for each, so a page never sits blank.

import { Link, useRouter, useRouterState, type ErrorComponentProps } from '@tanstack/react-router';
import { CloudOff, SearchX, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** A page still loading: the shape of a header and a few blocks. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('mx-auto max-w-3xl space-y-5', className)}
      role="status"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/70" />
      </div>
      <div className="h-28 animate-pulse rounded-xl bg-muted/60" />
      <div className="h-48 animate-pulse rounded-xl bg-muted/50" />
    </div>
  );
}

/**
 * A thin bar at the top of the page while the router waits for the next page's data. Shown only
 * after a moment, so quick navigations don't flicker.
 */
export function NavProgress() {
  const loading = useRouterState({ select: (s) => s.status === 'pending' });
  if (!loading) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-0.5 animate-[nav-progress-show_0s_150ms_forwards] overflow-hidden bg-primary/20 opacity-0"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}

/** A dashed box saying what would be here, and the one thing to do about it. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {Icon && <Icon className="mx-auto mb-2 size-6 text-primary/80" />}
      {title && <p className="font-medium text-foreground">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
      {action && <div className="mt-3 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

function Problem({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
      <div className="flex justify-center gap-2">{action}</div>
    </div>
  );
}

/** A page whose address leads nowhere, or whose thing was deleted. */
export function NotFound() {
  return (
    <Problem
      icon={SearchX}
      title="Nothing here"
      action={
        <Button asChild variant="outline">
          <Link to="/today">Go to Today</Link>
        </Button>
      }
    >
      This page doesn’t exist, or what it showed was deleted.
    </Problem>
  );
}

/** After a new version is built, a phone may still ask for the old version's files. */
const isStaleBuild = (err: unknown) =>
  err instanceof Error &&
  /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    err.message,
  );

/** A page that couldn't load: why, and a way to try again. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // A deleted thing, or an address that was never one (a malformed id answers 400).
  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
    return <NotFound />;
  }
  if (isStaleBuild(error)) {
    return (
      <Problem
        icon={CloudOff}
        title="There’s a new version"
        action={<Button onClick={() => location.reload()}>Reload</Button>}
      >
        Strekatron was updated while this page was open. Reload to get the new version.
      </Problem>
    );
  }
  return (
    <Problem
      icon={CloudOff}
      title="This page didn’t load"
      action={
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      }
    >
      {errorMessage(error)} If the computer running Strekatron is off or asleep, wake it and try
      again.
    </Problem>
  );
}
