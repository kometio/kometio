import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ReusableSectionEditorView } from '../app/sections/reusable-section-editor-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { reusableSectionQueryOptions } from '../app/sections/reusable-sections-queries';
import { requireAuth } from './-require-auth';

// Outside the admin shell, like the page and header/footer editors: the
// canvas wants the whole window.
//
// `locale` is optional and falls back to the site's default — a section has
// no locale of its own, this only decides which language its links resolve
// in while previewing.
const sectionEditorSearchSchema = z.object({
  locale: z.string().min(2).optional(),
});

export const Route = createFileRoute('/sections/$sectionId')({
  validateSearch: sectionEditorSearchSchema,
  loader: ({ context, params }) =>
    requireAuth(async () => {
      await context.queryClient.ensureQueryData(siteQueryOptions());
      await context.queryClient.ensureQueryData(
        reusableSectionQueryOptions(params.sectionId),
      );
    }),
  component: SectionEditorRoute,
});

function SectionEditorRoute() {
  const { sectionId } = Route.useParams();
  const { locale: searchLocale } = Route.useSearch();
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return (
    <ReusableSectionEditorView
      sectionId={sectionId}
      siteId={site.id}
      locale={searchLocale ?? site.defaultLocale}
    />
  );
}
