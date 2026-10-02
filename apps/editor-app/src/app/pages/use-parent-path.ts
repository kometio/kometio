import { useQuery, queryOptions } from '@tanstack/react-query';
import {
  getPageGroup,
  listPageGroupTranslations,
} from '../../lib/page-groups-api-client';

/**
 * The addresses a page's ancestors have, from the top of the tree down —
 * `["chi-siamo", "servizi"]` for a page under Services under About — in
 * one language.
 *
 * A page's address is its parent's and then its own, and the parent's is
 * its parent's again, so the answer is a walk up the tree: each ancestor's
 * language and its place. Read on its own, in one query, because how many
 * there are is only known by walking, and a chain of `useQuery` calls
 * cannot be written for a length nobody knows. A page whose parent has
 * none in this language falls back to what it does have, the way the
 * parent choice does.
 */
export function parentPathQueryOptions(
  parentId: string | null,
  locale: string,
) {
  return queryOptions({
    queryKey: ['page-groups', 'parent-path', parentId, locale] as const,
    queryFn: async (): Promise<string[]> => {
      const slugs: string[] = [];
      let id = parentId;
      while (id !== null) {
        const [group, translations] = await Promise.all([
          getPageGroup(id),
          listPageGroupTranslations(id),
        ]);
        const chosen =
          translations.find((translation) => translation.locale === locale) ??
          translations[0];
        if (chosen) slugs.unshift(chosen.slug);
        id = group.parentId;
      }
      return slugs;
    },
    enabled: parentId !== null,
  });
}

/** The slugs above a page, `[]` at the top level and while they are still being read. */
export function useParentPath(
  parentId: string | null,
  locale: string,
): string[] {
  const { data } = useQuery(parentPathQueryOptions(parentId, locale));
  return parentId === null ? [] : (data ?? []);
}
