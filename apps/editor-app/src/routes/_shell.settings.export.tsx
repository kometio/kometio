import { createFileRoute, redirect } from '@tanstack/react-router';
import { SiteArchiveSection } from '../app/settings/site-archive-section';
import { deploymentQueryOptions } from '../app/common/deployment-queries';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings/export')({
  beforeLoad: async ({ context }) => {
    await requirePermission(context.queryClient, 'configureSite');
    // The menu does not offer it where the server cannot make the archive; this
    // is for the address typed or bookmarked by hand, and for a server that has
    // not said: back to the settings, which open on a section that is there.
    const deployment = await context.queryClient
      .ensureQueryData(deploymentQueryOptions())
      .catch(() => null);
    if (deployment?.siteArchive !== true) {
      throw redirect({ to: '/settings' });
    }
  },
  component: SiteArchiveSection,
});
