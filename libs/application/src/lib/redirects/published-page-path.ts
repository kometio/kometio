import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import { PageAncestry } from '../use-cases/page-ancestry';

export interface PublishedPagePathDeps {
  pageGroupRepository: Pick<PageGroupRepositoryPort, 'findById'>;
  pageTranslationRepository: Pick<
    PageTranslationRepositoryPort,
    'findByGroupAndLocale'
  >;
}

/** What a page is, to a person choosing it and to a visitor sent to it. */
export interface PageTargetInfo {
  title: string;
  /** Where it answers, or `null` while it is not published in that language (or an ancestor has no segment there). */
  path: string | null;
  isPublished: boolean;
}

/**
 * Where one page answers in one language, with the same walk up the tree
 * every address is built from (`PageAncestry`), and what to call it.
 *
 * `null` when there is no such page in that language at all.
 */
export async function pageTargetInfo(
  deps: PublishedPagePathDeps,
  tenantId: string,
  pageGroupId: string,
  locale: string,
): Promise<PageTargetInfo | null> {
  const translation = await deps.pageTranslationRepository.findByGroupAndLocale(
    tenantId,
    pageGroupId,
    locale,
  );
  if (!translation) return null;
  const title = translation.seoMeta.title.trim() || translation.slug;
  if (translation.status !== 'published') {
    return { title, path: null, isPublished: false };
  }
  const group = await deps.pageGroupRepository.findById(tenantId, pageGroupId);
  if (!group) return null;

  const ancestry = new PageAncestry(async (groupId) => {
    const found = await deps.pageGroupRepository.findById(tenantId, groupId);
    return found ? found.parentId : undefined;
  });
  const ancestorSlugs = await ancestry.slugsDownTo(
    group.parentId,
    async (groupId) =>
      (
        await deps.pageTranslationRepository.findByGroupAndLocale(
          tenantId,
          groupId,
          locale,
        )
      )?.slug,
  );
  return {
    title,
    path:
      ancestorSlugs === null
        ? null
        : localePathFromAncestors(locale, ancestorSlugs, translation.slug),
    isPublished: true,
  };
}
