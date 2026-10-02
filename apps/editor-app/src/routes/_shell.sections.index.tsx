import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { REUSABLE_SECTION_KINDS } from '@kometio/shared-types';
import { SectionsListView } from '../app/sections/sections-list-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { reusableSectionsQueryOptions } from '../app/sections/reusable-sections-queries';
import { requireAuth } from './-require-auth';

// Which of the two lists is open — in the address, so "the templates" is a
// link, and Back does not have to guess. Optional at the type level for
// every plain <Link to="/sections"> and back to the shared sections on a
// garbled value.
const sectionsSearchSchema = z.object({
  kind: z.enum(REUSABLE_SECTION_KINDS).default('shared').catch('shared'),
});

export const Route = createFileRoute('/_shell/sections/')({
  staticData: { titleKey: 'shell.nav.sections' },
  validateSearch: sectionsSearchSchema,
  loader: ({ context }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      await context.queryClient.ensureQueryData(
        reusableSectionsQueryOptions(site.id),
      );
    }),
  component: SectionsRoute,
});

function SectionsRoute() {
  const { kind } = Route.useSearch();
  const navigate = useNavigate();
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  return (
    <SectionsListView
      siteId={site.id}
      kind={kind}
      // A tab is not a place to come back to: replaced, so Back leaves the
      // screen rather than walking through the tabs that were looked at.
      onKindChange={(next) =>
        void navigate({
          to: '/sections',
          search: { kind: next },
          replace: true,
        })
      }
    />
  );
}
