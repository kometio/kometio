import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import type { PageTranslation } from '@kometio/domain-core';
import { PageAncestry } from './page-ancestry';

/** One language of a page, and everything needed to build its real address. */
export interface TranslationPath {
  locale: string;
  slug: string;
  /** Root first, not including the page itself. Empty for a root-level page. */
  ancestorSlugs: string[];
}

/**
 * The reachable address of a page in every language it has.
 *
 * Slugs are scoped to their siblings (ADR-0029), so a page's URL is the
 * whole chain — `/it/docs/getting-started/first-run`, not `/it/first-run`.
 * A consumer given only `{ locale, slug }` cannot build that, and the ones
 * that tried produced links that 404: the language switcher and the
 * `hreflang` alternates both did, on every nested page, once slugs stopped
 * resolving by their trailing segment alone.
 *
 * An ancestor's slug is per-locale — a site may call a section `docs` in
 * English and `documentazione` in Italian — so the chain is resolved
 * separately for each language rather than reused from the one being
 * rendered. That reuse is the tempting shortcut, and it fails exactly on
 * the sites that translate their section names, by producing a link that
 * looks right and 404s.
 *
 * A language whose chain is incomplete is DROPPED, not returned with a
 * partial path: if an ancestor group has no translation there, the page is
 * not reachable at any URL in that language (the top-down walk in
 * `resolvePageGroupByPath` would stop at the missing segment), so there is
 * nothing to link to. Same rule `listPublishedPagesForSitemap` already
 * applies before emitting a sitemap entry.
 *
 * Existence, not publication, is what the chain needs — mirroring
 * `findByParentGroupAndLocaleSlug`, which resolves a segment without
 * looking at its status. Whether the page ITSELF is published is the
 * caller's filter, and it stays there.
 */
export async function resolveTranslationPaths(
  deps: {
    pageGroupRepository: PageGroupRepositoryPort;
    pageTranslationRepository: PageTranslationRepositoryPort;
  },
  tenantId: string,
  parentGroupId: string | null,
  translations: PageTranslation[],
): Promise<TranslationPath[]> {
  const ancestorGroupIds = await PageAncestry.fromRepository(
    deps.pageGroupRepository,
    tenantId,
  ).groupIdsDownTo(parentGroupId);
  // A broken chain reaches the page in no language at all.
  if (ancestorGroupIds === null) return [];
  if (ancestorGroupIds.length === 0) {
    return translations.map((translation) => ({
      locale: translation.locale,
      slug: translation.slug,
      ancestorSlugs: [],
    }));
  }

  // One query per ancestor, not per ancestor AND language: `listByGroup`
  // already returns every locale of a group.
  const slugsByAncestor = await Promise.all(
    ancestorGroupIds.map(async (groupId) => {
      const siblings = await deps.pageTranslationRepository.listByGroup(
        tenantId,
        groupId,
      );
      return new Map(
        siblings.map((sibling) => [sibling.locale, sibling.slug] as const),
      );
    }),
  );

  const paths: TranslationPath[] = [];
  for (const translation of translations) {
    const ancestorSlugs: string[] = [];
    let reachable = true;
    for (const byLocale of slugsByAncestor) {
      const slug = byLocale.get(translation.locale);
      if (slug === undefined) {
        reachable = false;
        break;
      }
      ancestorSlugs.push(slug);
    }
    if (reachable) {
      paths.push({
        locale: translation.locale,
        slug: translation.slug,
        ancestorSlugs,
      });
    }
  }
  return paths;
}
