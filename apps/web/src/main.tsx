import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { ApiError, errorMessage, setGameHandler } from './lib/api';
import { celebrate } from './lib/game';
import { setErrorHandler } from './lib/report';
import { anyBusy, flushAll } from './lib/saver';
import { followSystemTheme } from './lib/theme';
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
    // Only for data already on screen; a first load shows its own error state.
    onError: (err, query) => query.state.data !== undefined && showError(err),
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.options.onError) showError(err);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

setGameHandler((events) => celebrate(queryClient, events));

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0, // TanStack Query decides freshness
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

followSystemTheme();

// Whatever waits to be saved goes when the page is hidden (tab switched, app put away, closed).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushAll();
});
window.addEventListener('pagehide', () => void flushAll());
window.addEventListener('beforeunload', (e) => {
  if (anyBusy()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
