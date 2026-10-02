import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { formsQueryOptions } from '../app/forms/forms-queries';
import { FormsListView } from '../app/forms/forms-list-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';

// Same reasoning as pagesListSearchSchema (routes/_shell.pages.index.tsx).
const formsListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  // Arrive with "New form" already open — the search's first action. Read
  // once and dropped from the URL, so a reload does not ask again.
  new: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/_shell/forms/')({
  staticData: { titleKey: 'shell.nav.forms' },
  validateSearch: formsListSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  // The site is resolved first because its id is what scopes the list —
  // one extra await, not one extra request: the entry is shared with every
  // other screen.
  loader: ({ context, deps }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      await context.queryClient.ensureQueryData(
        formsQueryOptions(site.id, deps.page),
      );
    }),
  component: FormsListRoute,
});

function FormsListRoute() {
  const { page, new: startCreating } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (startCreating) {
      void navigate({ to: '/forms', search: { page }, replace: true });
    }
  }, [startCreating, page, navigate]);
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const { data } = useSuspenseQuery(formsQueryOptions(site.id, page));

  return (
    <FormsListView
      siteId={site.id}
      forms={data.items}
      page={page}
      total={data.total}
      startCreating={startCreating === true}
    />
  );
}
