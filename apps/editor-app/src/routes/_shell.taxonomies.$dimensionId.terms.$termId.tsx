import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from '../lib/use-translation';
import { TermEditorView } from '../app/taxonomies/term-editor-view';
import {
  taxonomiesQueryOptions,
  termsQueryOptions,
} from '../app/taxonomies/taxonomies-queries';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

// A term is a page of its own so it has an address somebody can be sent
// (SCHERMATE-EDITOR.md): the category is in the path because a term belongs
// to exactly one.
export const Route = createFileRoute(
  '/_shell/taxonomies/$dimensionId/terms/$termId',
)({
  staticData: { titleKey: 'shell.nav.taxonomies' },
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'changeLiveSite'),
  loader: ({ context, params }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      await Promise.all([
        context.queryClient.ensureQueryData(taxonomiesQueryOptions(site.id)),
        context.queryClient.ensureQueryData(
          termsQueryOptions(params.dimensionId),
        ),
      ]);
    }),
  component: TermEditorRoute,
});

function TermEditorRoute() {
  const { t } = useTranslation();
  const { dimensionId, termId } = Route.useParams();
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const { data: taxonomies } = useSuspenseQuery(
    taxonomiesQueryOptions(site.id),
  );
  const { data: terms } = useSuspenseQuery(termsQueryOptions(dimensionId));
  const taxonomy = taxonomies.find((one) => one.id === dimensionId);
  const term = terms.find((one) => one.id === termId);

  // A link to a term that has since been deleted, or to another site's.
  if (!taxonomy || !term) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {t('taxonomies.term.notFound')}
        </p>
        <Link to="/taxonomies" className="text-sm underline">
          {t('taxonomies.term.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <TermEditorView
      // One editor per term: the form starts from the term it opened on.
      key={term.id}
      siteId={site.id}
      taxonomy={taxonomy}
      term={term}
      terms={terms}
      locales={site.enabledLocales}
      defaultLocale={site.defaultLocale}
    />
  );
}
