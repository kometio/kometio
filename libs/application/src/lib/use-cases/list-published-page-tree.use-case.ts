import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { PageAncestry } from './page-ancestry';

export interface ListPublishedPageTreeDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface ListPublishedPageTreeInput {
  tenantId: string;
  domain: string;
  locale: string;
}

export interface PageTreeNode {
  // Was the old Page's own id (per-locale) — now the shared PageGroup's
  // id, since the hierarchy this tree walks is shared across locales.
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  ancestorSlugs: string[];
  order: number;
  createdAt: string;
}

// Same "5-15 pagine, siti vetrina" scale assumption as
// listPublishedPagesForSitemap.use-case.ts.
const PAGE_TREE_PAGE_SIZE = 1000;

/**
 * i18n a livello di campo (see the plan) — replaces the old Page-based
 * implementation, same "built for a theme's sidebar" purpose and public,
 * unauthenticated posture as before. A page under an ancestor with no
 * translation in `input.locale` is left out, as the sitemap leaves it
 * out: a theme links every entry at its `ancestorSlugs`, and a chain cut
 * short made that link a 404.
 */
export async function listPublishedPageTree(
  deps: ListPublishedPageTreeDeps,
  input: ListPublishedPageTreeInput,
): Promise<PageTreeNode[] | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }

  const { items: groups } = await deps.pageGroupRepository.listBySite(
    input.tenantId,
    site.id,
    { page: 1, pageSize: PAGE_TREE_PAGE_SIZE },
  );
  const translationLists = await Promise.all(
    groups.map((group) =>
      deps.pageTranslationRepository.listByGroup(input.tenantId, group.id),
    ),
  );
  const translationsForLocale = translationLists
    .flat()
    .filter((translation) => translation.locale === input.locale);

  const parentIdByGroup = new Map<string, string | null>(
    groups.map((group) => [group.id, group.parentId]),
  );
  const orderByGroup = new Map<string, number>(
    groups.map((group) => [group.id, group.order]),
  );
  const translationByGroup = new Map(
    translationsForLocale.map((translation) => [
      translation.pageGroupId,
      translation,
    ]),
  );
  const published = translationsForLocale.filter(
    (translation) => translation.status === 'published',
  );
  const publishedGroupIds = new Set(
    published.map((translation) => translation.pageGroupId),
  );

  const ancestry = PageAncestry.fromParents(parentIdByGroup);
  const nodes = await Promise.all(
    published.map(async (translation) => {
      const parentId = parentIdByGroup.get(translation.pageGroupId) ?? null;
      const ancestorSlugs = await ancestry.slugsDownTo(
        parentId,
        (groupId) => translationByGroup.get(groupId)?.slug,
      );
      if (ancestorSlugs === null) return null;
      return {
        id: translation.pageGroupId,
        // A parent that's unpublished isn't something the sidebar can
        // link to or nest under — treated as a root entry instead, while
        // its slug still belongs in the address.
        parentId: parentId && publishedGroupIds.has(parentId) ? parentId : null,
        slug: translation.slug,
        title: translation.seoMeta.title,
        ancestorSlugs,
        order: orderByGroup.get(translation.pageGroupId) ?? 0,
        createdAt: translation.createdAt.toISOString(),
      };
    }),
  );
  return nodes.filter((node): node is PageTreeNode => node !== null);
}
