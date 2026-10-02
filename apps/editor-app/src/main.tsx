import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import './i18n';
import './styles.css';
import { TooltipProvider } from './components/ui/tooltip';
import { setupGlobalErrorHandlers } from './global-error-handlers';
import { ApiError } from './lib/http-client';
import { routeTree } from './routeTree.gen';
import { ToastProvider } from './app/shell/toast-provider';
import { applyTheme, getInitialTheme } from './theme';

setupGlobalErrorHandlers();

// Applied before the first render, not inside a component — otherwise the
// page would flash the light theme for a frame before a dark preference
// (see app/use-theme.ts, app/account-menu.tsx) took effect.
applyTheme(getInitialTheme());

// Retrying a 4xx can't succeed — "you're not logged in" (401) or "this name
// is already taken" (409) aren't transient network hiccups, retrying just
// resends the same bad request. Every guarded route loader is also waiting
// on a 401 to reject before it can redirect to /login (see
// routes/-require-auth.ts), so retrying it would only delay that redirect.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 3;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry },
    // Security review 2026-08-24, "terzo giro": shouldRetry was also applied
    // to mutations. Most mutations here aren't idempotent (createPage,
    // createForm, inviteUser, ...) — retrying a 5xx whose response was lost
    // in transit (the request itself may well have succeeded server-side)
    // risks creating the resource twice. No mutation.retry override exists
    // anywhere in the app today, so this can't silently disable a retry
    // some call site actually needed.
    mutations: { retry: false },
  },
});
const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
