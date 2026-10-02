import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { LegalDocumentsWizard } from '../app/legal/legal-documents-wizard';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute(
  '/_shell/settings/cookies/legal-documents',
)({
  // The same permission as the screen it is opened from: the parent area lets a
  // publisher in for its collections, and this is not one of them.
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'configureSite'),
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: LegalDocumentsRoute,
});

function LegalDocumentsRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return <LegalDocumentsWizard siteId={site.id} site={site} />;
}
