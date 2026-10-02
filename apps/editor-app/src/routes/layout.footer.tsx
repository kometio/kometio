import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { siteLayoutSectionQueryOptions } from '../app/layout/site-layout-sections-queries';
import { siteQueryOptions } from '../app/settings/site-queries';
import { SiteLayoutSectionEditorView } from '../app/layout/site-layout-section-editor-view';
import { requireAuth } from './-require-auth';

// Same reasoning as layout.header.tsx's own schema.
const layoutFooterSearchSchema = z.object({
  locale: z.string().min(2).optional(),
});

export const Route = createFileRoute('/layout/footer')({
  validateSearch: layoutFooterSearchSchema,
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      const locale = deps.locale ?? site.defaultLocale;
      await context.queryClient.ensureQueryData(
        siteLayoutSectionQueryOptions(site.id, locale, 'footer'),
      );
    }),
  component: LayoutFooterRoute,
});

function LayoutFooterRoute() {
  const { locale: searchLocale } = Route.useSearch();
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const locale = searchLocale ?? site.defaultLocale;

  return (
    <SiteLayoutSectionEditorView
      key={locale}
      siteId={site.id}
      locale={locale}
      enabledLocales={site.enabledLocales}
      kind="footer"
    />
  );
}
