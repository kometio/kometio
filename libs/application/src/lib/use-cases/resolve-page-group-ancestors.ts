import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import { PageAncestry } from './page-ancestry';

/** Root-to-parent order (does not include the page itself). Empty for a root-level page. */
export interface PageAncestor {
  slug: string;
  title: string;
}

/**
 * Shared by getPublishedPageBySlug (via resolvePageGroupByPath) and
 * getPreviewPageById — walks the SHARED hierarchy (PageGroup.parentId)
 * one hop at a time. The hierarchy walk itself doesn't need a
 * locale (it's shared), but the slug/title shown for each ancestor does:
 * tries `locale` first, falls back to `defaultLocale` if that ancestor
 * group has no translation there — same fallback precedent as
 * resolveUntranslatedPageFallback (a group can have its default-locale
 * translation deleted while a sibling elsewhere still exists). An
 * ancestor with NEITHER is silently skipped (not surfaced as a broken
 * crumb) rather than aborting the whole walk — the leaf page itself still
 * resolved, a missing breadcrumb label for one ancestor isn't worth
 * hiding the rest of the trail. A chain that cannot be followed to the
 * root at all (see PageAncestry) gives no trail.
 */
export async function resolvePageGroupAncestors(
  deps: {
    pageGroupRepository: PageGroupRepositoryPort;
    pageTranslationRepository: PageTranslationRepositoryPort;
  },
  tenantId: string,
  locale: string,
  defaultLocale: string,
  parentGroupId: string | null,
): Promise<PageAncestor[]> {
  const ancestorIds =
    (await PageAncestry.fromRepository(
      deps.pageGroupRepository,
      tenantId,
    ).groupIdsDownTo(parentGroupId)) ?? [];

  const ancestors: PageAncestor[] = [];
  for (const groupId of ancestorIds) {
    const translation =
      (await deps.pageTranslationRepository.findByGroupAndLocale(
        tenantId,
        groupId,
        locale,
      )) ??
      (locale === defaultLocale
        ? null
        : await deps.pageTranslationRepository.findByGroupAndLocale(
            tenantId,
            groupId,
            defaultLocale,
          ));
    if (translation) {
      ancestors.push({
        slug: translation.slug,
        title: translation.seoMeta.title || translation.slug,
      });
    }
  }

  return ancestors;
}
