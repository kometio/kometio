import { useQuery } from '@tanstack/react-query';
import {
  pageGroupsQueryOptions,
  pageGroupTranslationsQueryOptions,
} from './page-groups-queries';

/**
 * The Header/Footer editor has no page of its own — canvas-editor-shell.tsx
 * always shows the real Astro canvas of ONE PageTranslation (see
 * canvas-frame.tsx), even while editing the header or footer, so as to
 * reuse the same preview route rather than building a second dedicated one.
 * This hook picks that translation: the first one in the edited section's
 * locale, among the site's first `PAGE_GROUPS_PAGE_SIZE` groups — not
 * exhaustive on sites with more pages than fit in a single page of results,
 * but it is only the backdrop for viewing the header/footer being edited,
 * not the edited content itself. The server-side `locale` filter guarantees
 * the first group returned already has a translation in this language, so
 * the second fetch (the group's translations) needs no empty fallback of
 * its own.
 */
export function useRepresentativePage(siteId: string, locale: string) {
  const { data: groups, isLoading: isLoadingGroups } = useQuery(
    pageGroupsQueryOptions(siteId, 1, { locale }),
  );
  const groupId = groups?.items[0]?.id ?? null;
  const { data: translations, isLoading: isLoadingTranslations } = useQuery({
    ...pageGroupTranslationsQueryOptions(groupId ?? ''),
    enabled: Boolean(groupId),
  });
  const translation =
    translations?.find((item) => item.locale === locale) ?? null;
  return {
    page: translation ? { id: translation.id } : null,
    isLoading: isLoadingGroups || (Boolean(groupId) && isLoadingTranslations),
  };
}
