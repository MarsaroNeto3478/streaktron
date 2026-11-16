import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { NotFound, PageSkeleton, RouteError } from './components/page-states';
import { ApiError, errorMessage, isUnreachable, setGameHandler, setReachHandler } from './lib/api';
import { celebrate } from './lib/game';
import { keepCache, MAX_AGE_MS, restoreCache } from './lib/offline-cache';
import { reached, setSyncedHandler, startOutbox } from './lib/outbox';
import { registerServiceWorker } from './lib/push';
import { setErrorHandler } from './lib/report';
import { anyBusy, flushAll } from './lib/saver';
import { startTheme } from './lib/theme';
import { routeTree } from './routeTree.gen';
import './index.css';

// One place where failed requests become visible. A 401 isn't shown: it leads to sign-in.
const showError = (err: unknown) => {
  if (err instanceof ApiError && err.isUnauthorized) {
    void router.navigate({ to: '/sign-in', search: { redirect: location.pathname } });
    return;
  }
  toast.error(errorMessage(err));
};
setErrorHandler(showError);

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Only for data already on screen; a first load shows its own error state. Offline, what's on
    // screen stays and the top bar says so (D55).
    onError: (err, query) =>
      query.state.data !== undefined && !isUnreachable(err) && showError(err),
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.options.onError) showError(err);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      // Kept (and saved on the device) while unused, so pages open offline (D55).
      gcTime: MAX_AGE_MS,
      // Ask even when the device says it's offline: a page never opened here fails (and says
      // so) instead of waiting forever, and the server may be on the same network anyway.
      networkMode: 'always',
    },
  },
});

setGameHandler((events) => celebrate(queryClient, events));

// Offline (D55): the top bar follows whether the server answers; once changes made offline have
// gone, everything is fetched again and anything refused is said.
setReachHandler(reached);
setSyncedHandler(({ synced, failed }) => {
  void queryClient.invalidateQueries();
  if (synced)
    toast.success(`Synced ${synced === 1 ? '1 change' : `${synced} changes`} made offline`);
  for (const f of failed) toast.error(`Couldn’t sync “${f.label}”`, { description: f.message });
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0, // TanStack Query decides freshness
  scrollRestoration: true,
  // Shared page states (D53): a skeleton when data takes long, an error with "Try again", and a
  // page for addresses that lead nowhere.
  defaultPendingComponent: () => <PageSkeleton />,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

startTheme();

// Installable app, push notifications (D45) and the app kept for offline use (D55); a tapped
// notification moves the router.
void registerServiceWorker((to) => void router.navigate({ to }));

// Whatever waits to be saved goes when the page is hidden (tab switched, app put away, closed).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushAll();
});
window.addEventListener('pagehide', () => void flushAll());
window.addEventListener('beforeunload', (e) => {
  if (anyBusy()) e.preventDefault();
});

// What was loaded last time comes back before the first page loads (D55), so the app opens with
// your data even when the server can't be reached. A slow device doesn't hold the app up.
await Promise.race([
  restoreCache(queryClient).catch(() => {}),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]);
keepCache(queryClient);
void startOutbox();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
