import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { LayoutView } from '../app/layout/layout-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';

// `locale` is optional (falls back to the site's own defaultLocale once
// loaded, see below) so a bare <Link to="/layout"> stays valid at the
// type level, same reasoning as pagesListSearchSchema's `page`.
const layoutSearchSchema = z.object({
  locale: z.string().min(2).optional(),
});

export const Route = createFileRoute('/_shell/layout/')({
  staticData: { titleKey: 'shell.nav.layout' },
  validateSearch: layoutSearchSchema,
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: LayoutRoute,
});

function LayoutRoute() {
  const { locale } = Route.useSearch();
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return (
    <LayoutView
      enabledLocales={site.enabledLocales}
      locale={locale ?? site.defaultLocale}
    />
  );
}
