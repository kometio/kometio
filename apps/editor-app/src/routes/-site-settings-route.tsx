import type { ComponentType } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { Permission } from '@kometio/shared-types';
import type { SiteRecord } from '@kometio/api-contracts';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

/** What a loader is handed, as far as these routes read it. Exported because a route's declaration has to be able to name it. */
export interface RouteContext {
  context: { queryClient: QueryClient };
}

/**
 * What a route under /settings does when its section edits the site
 * record: ask for the permission, load the site before the screen draws,
 * and hand it to the section. Five routes were the same fifteen lines.
 */
export function siteSettingsRoute(
  permission: Permission,
  Section: ComponentType<{ site: SiteRecord }>,
) {
  return {
    beforeLoad: ({ context }: RouteContext) =>
      requirePermission(context.queryClient, permission),
    loader: ({ context }: RouteContext) =>
      requireAuth(() =>
        context.queryClient.ensureQueryData(siteQueryOptions()),
      ),
    component: function SiteSettingsRoute() {
      const { data: site } = useSuspenseQuery(siteQueryOptions());
      return <Section site={site} />;
    },
  };
}
