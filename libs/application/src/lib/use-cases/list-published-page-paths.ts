import type { PageGridItem } from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import type { PageTranslation } from '@kometio/domain-core';
import { PageAncestry } from './page-ancestry';

export interface ListPublishedPagePathsDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

/** Where one published translation actually lives, and what to call it. */
export interface PublishedPagePath {
  groupId: string;
  locale: string;
  slug: string;
  /** Root-to-parent, in THIS language — slugs are sibling-scoped (ADR-0029), so a slug alone is not an address. */
  ancestorSlugs: string[];
  /** What a link to it should say: the SEO title when there is one, the slug otherwise — the same `seoMeta.title || slug` rule the rest of the codebase uses. */
  title: string;
  /** The summary its author already wrote for search engines, reused rather than invented a second time. */
  description: string;
  /** The picture it already shows when shared — the same one a card wants. */
  image: string | null;
  /** When this language went live. `null` only for a page published before the column existed. */
  publishedAt: Date | null;
  updatedAt: Date;
  /** Which section of the editor lists it — what scopes "the previous article" to the right set of pages. */
  collectionId: string | null;
  /** Who created it — what an author's page lists (docs/adr/0071). `null` when the account is gone. */
  authorUserId: string | null;
  /** Its parent in the page tree, `null` at the root — what "the pages under this one" is asked of. */
  parentId: string | null;
  /** Its place among its siblings, the order a manual is read in. */
  order: number;
}

// Same "5-15 pagine, siti vetrina" scale assumption as everywhere else.
const PAGE_SIZE = 1000;

/**
 * Every published page of one site, with the address it answers at.
 *
 * One implementation of "where does this page live", shared by the
 * sitemap and by the page lists a term draws (docs/adr/0064) — they were
 * about to be two walks of the same hierarchy, which is exactly how two
 * answers to one question start disagreeing.
 */
export async function listPublishedPagePaths(
  deps: ListPublishedPagePathsDeps,
  tenantId: string,
  siteId: string,
): Promise<PublishedPagePath[]> {
  const { items: groups } = await deps.pageGroupRepository.listBySite(
    tenantId,
    siteId,
    { page: 1, pageSize: PAGE_SIZE },
  );
  const translationLists = await Promise.all(
    groups.map((group) =>
      deps.pageTranslationRepository.listByGroup(tenantId, group.id),
    ),
  );
  const translations = translationLists.flat();

  const parentIdByGroup = new Map<string, string | null>(
    groups.map((group) => [group.id, group.parentId]),
  );
  const collectionIdByGroup = new Map<string, string | null>(
    groups.map((group) => [group.id, group.collectionId]),
  );
  const authorByGroup = new Map<string, string | null>(
    groups.map((group) => [group.id, group.createdBy]),
  );
  const orderByGroup = new Map<string, number>(
    groups.map((group) => [group.id, group.order]),
  );
  const translationsByGroupAndLocale = new Map<string, PageTranslation>(
    translations.map((translation) => [
      `${translation.pageGroupId}:${translation.locale}`,
      translation,
    ]),
  );

  const ancestry = PageAncestry.fromParents(parentIdByGroup);
  const paths: PublishedPagePath[] = [];
  for (const translation of translations) {
    if (translation.status !== 'published') continue;
    // A leaf can be published under an ancestor with no translation in
    // its language: no address reaches it, so it is left out rather than
    // listed at a path that answers nothing.
    const ancestorSlugs = await ancestry.slugsDownTo(
      parentIdByGroup.get(translation.pageGroupId) ?? null,
      (groupId) =>
        translationsByGroupAndLocale.get(`${groupId}:${translation.locale}`)
          ?.slug,
    );
    if (ancestorSlugs === null) continue;
    paths.push({
      groupId: translation.pageGroupId,
      locale: translation.locale,
      slug: translation.slug,
      ancestorSlugs,
      title: translation.seoMeta.title.trim() || translation.slug,
      description: translation.seoMeta.description,
      image: translation.seoMeta.ogTags?.['image'] ?? null,
      publishedAt: translation.publishedAt,
      updatedAt: translation.updatedAt,
      collectionId: collectionIdByGroup.get(translation.pageGroupId) ?? null,
      authorUserId: authorByGroup.get(translation.pageGroupId) ?? null,
      parentId: parentIdByGroup.get(translation.pageGroupId) ?? null,
      order: orderByGroup.get(translation.pageGroupId) ?? 0,
    });
  }
  return paths;
}

/**
 * What a list of pages says about one of them — its title, address, date,
 * summary and picture — in the language it is being read in.
 *
 * Here, next to the paths it is made from, because four blocks build the
 * same card from the same path: the article's neighbours and related
 * pages, a page's children and siblings. One copy each would be four
 * cards that could drift apart.
 */
export function toPageGridItem(
  path: PublishedPagePath,
  locale: string,
  /** The filter terms the page answers to — empty for a list no TermList narrows. */
  termSlugs: string[] = [],
): PageGridItem {
  return {
    pageGroupId: path.groupId,
    title: path.title,
    path: localePathFromAncestors(locale, path.ancestorSlugs, path.slug),
    publishedAt: path.publishedAt ? path.publishedAt.toISOString() : null,
    excerpt: path.description,
    image: path.image,
    termSlugs,
  };
}
