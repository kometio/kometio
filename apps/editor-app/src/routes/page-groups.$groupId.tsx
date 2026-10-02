import { createFileRoute } from '@tanstack/react-router';
import {
  pageGroupQueryOptions,
  pageGroupTranslationsQueryOptions,
} from '../app/pages/page-groups-queries';
import { siteQueryOptions } from '../app/settings/site-queries';
import { PageGroupEditorView } from '../app/pages/page-group-editor-view';
import { PageGroupWithoutLanguage } from '../app/pages/page-group-without-language';
import { requireAuth } from './-require-auth';

export const Route = createFileRoute('/page-groups/$groupId')({
  loader: ({ context, params }) =>
    requireAuth(async () => {
      const [group, translations] = await Promise.all([
        context.queryClient.ensureQueryData(
          pageGroupQueryOptions(params.groupId),
        ),
        context.queryClient.ensureQueryData(
          pageGroupTranslationsQueryOptions(params.groupId),
        ),
      ]);
      // Warmed here (not left to CanvasEditorShell's own later fetch) so
      // the initial active locale below can be the site's default one —
      // "opens where the shared content lives" is the more intuitive
      // default than an arbitrary first-in-list translation.
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      return { group, translations, site };
    }),
  component: PageGroupEditorRoute,
});

function PageGroupEditorRoute() {
  const { groupId } = Route.useParams();
  const { site, translations } = Route.useLoaderData();
  // Everything in the editor hangs off the language being edited.
  const [firstTranslation] = translations;
  if (firstTranslation === undefined) {
    return <PageGroupWithoutLanguage />;
  }
  const initialLocale = translations.some(
    (translation) => translation.locale === site.defaultLocale,
  )
    ? site.defaultLocale
    : firstTranslation.locale;
  return (
    <PageGroupEditorView
      key={groupId}
      groupId={groupId}
      initialLocale={initialLocale}
      defaultLocale={site.defaultLocale}
      enabledLocales={site.enabledLocales}
    />
  );
}
