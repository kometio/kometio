import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { RouteError } from '../app/shell/route-error';
import { RoutePending } from '../app/shell/route-pending';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
