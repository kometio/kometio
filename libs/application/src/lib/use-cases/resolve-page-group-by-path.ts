import type { PageGroup, PageTranslation } from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import type { PageAncestor } from './resolve-page-group-ancestors';
import { PageAncestry } from './page-ancestry';

// The deepest address there is: as many ancestors as PageAncestry follows,
// and the page itself. Deeper than that, no walk up could have built it.
const MAX_PATH_SEGMENTS = PageAncestry.MAX_DEPTH + 1;

export interface PageGroupByPath {
  group: PageGroup;
  translation: PageTranslation;
  /** Root-to-parent order, same shape as resolvePageByPath's own. */
  ancestors: PageAncestor[];
  /**
   * At least one segment of the requested path was an address a page has
   * since left, so this path is not where the page lives any more.
   *
   * The caller answers with a 301 to `currentPath` rather than serving
   * the page here: two addresses both serving the same content is the
   * duplicate the whole rename mechanism exists to avoid.
   */
  moved: boolean;
  /** Root-to-leaf, the addresses these pages answer at NOW. */
  currentPath: string[];
}

/**
 * PageGroup-based replacement for resolvePageByPath — walks the URL path
 * top-down one segment at a time via
 * PageTranslationRepositoryPort.findByParentGroupAndLocaleSlug (its own
 * doc comment describes exactly this loop), same reasoning as the
 * original: sibling-scoped slugs make the trailing segment alone
 * ambiguous. `parentGroupId` threads through as the previous hop's
 * `pageGroupId` — the shared hierarchy anchor, replacing the old
 * `parentId = page.id` chaining.
 */
export async function resolvePageGroupByPath(
  deps: {
    pageGroupRepository: PageGroupRepositoryPort;
    pageTranslationRepository: PageTranslationRepositoryPort;
  },
  tenantId: string,
  siteId: string,
  locale: string,
  segments: string[],
): Promise<PageGroupByPath | null> {
  if (segments.length === 0 || segments.length > MAX_PATH_SEGMENTS) {
    return null;
  }

  const ancestors: PageAncestor[] = [];
  const currentPath: string[] = [];
  let parentGroupId: string | null = null;
  let translation: PageTranslation | null = null;
  let moved = false;

  for (const [i, segment] of segments.entries()) {
    translation =
      await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
        tenantId,
        siteId,
        locale,
        parentGroupId,
        segment,
      );
    if (!translation) {
      // Nothing answers here now — but something may have, before it was
      // renamed. Asked at EVERY level, not only the last: renaming a
      // section changes the address of everything underneath it, and a
      // link to a child is exactly as saved and as followed as a link to
      // the section itself.
      translation = await deps.pageTranslationRepository.findByFormerSlug(
        tenantId,
        siteId,
        locale,
        parentGroupId,
        segment,
      );
      if (translation) {
        moved = true;
        currentPath.push(translation.slug);
      } else {
        // Still nothing: the page may have kept its name and changed
        // parent instead (docs/adr/0074). Where it lives now is not this
        // branch at all, so the path collected so far is not a prefix of
        // its address — it is rebuilt from the parents it hangs from now.
        translation = await deps.pageTranslationRepository.findByFormerParent(
          tenantId,
          siteId,
          locale,
          parentGroupId,
          segment,
        );
        if (!translation) return null;
        const wherePageLivesNow = await currentPathOf(
          deps,
          tenantId,
          locale,
          translation,
        );
        // No address in this language any more (an ancestor lost its
        // translation): nowhere to send the visitor, so this is a 404
        // rather than a redirect to a path that does not resolve.
        if (!wherePageLivesNow) return null;
        moved = true;
        currentPath.length = 0;
        currentPath.push(...wherePageLivesNow);
      }
    } else {
      currentPath.push(translation.slug);
    }
    if (i < segments.length - 1) {
      ancestors.push({
        slug: translation.slug,
        title: translation.seoMeta.title || translation.slug,
      });
    }
    parentGroupId = translation.pageGroupId;
  }
  if (!translation) return null;

  const group = await deps.pageGroupRepository.findById(
    tenantId,
    translation.pageGroupId,
  );
  if (!group) return null;

  return { group, translation, ancestors, moved, currentPath };
}

/**
 * The path this translation answers at right now, root to leaf, or null
 * when one of the parents it hangs from has no translation in this
 * language.
 *
 * Only needed for a page that MOVED: for a rename the walk already has
 * the right prefix, because the page is still where the path said it
 * was. `resolvePageGroupAncestors` is the richer version of this walk
 * (it also resolves a title, and falls back to the default locale for
 * one); a redirect needs neither, and falling back would send a visitor
 * to an address made of two languages.
 */
async function currentPathOf(
  deps: {
    pageGroupRepository: PageGroupRepositoryPort;
    pageTranslationRepository: PageTranslationRepositoryPort;
  },
  tenantId: string,
  locale: string,
  translation: PageTranslation,
): Promise<string[] | null> {
  const group = await deps.pageGroupRepository.findById(
    tenantId,
    translation.pageGroupId,
  );
  if (!group) return null;
  const ancestorSlugs = await PageAncestry.fromRepository(
    deps.pageGroupRepository,
    tenantId,
  ).slugsDownTo(
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
  return ancestorSlugs && [...ancestorSlugs, translation.slug];
}
