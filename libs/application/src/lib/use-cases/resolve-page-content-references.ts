import {
  collectPageGroupReferences,
  resolvePageReferences,
  type PageContent,
  type PageGroupSlugMap,
} from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import { PageAncestry } from './page-ancestry';
import { resolvePageGridItems } from './resolve-page-grid-items';
import { resolveTermLists } from './resolve-term-lists';
import { resolveTableOfContents } from './resolve-table-of-contents';
import {
  hasSiteNavigationBlocks,
  resolveSiteNavigationBlocks,
} from './resolve-site-navigation-blocks';
import { resolveSectionInstances } from './resolve-section-instances';
import {
  hasArticleBlocks,
  resolveArticleBlocks,
  type CurrentArticle,
} from './resolve-article-blocks';
import type { MediaUrlResolver } from './author-profile';

export interface ResolvePageContentReferencesDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  /** Which pages carry which term — what a PageGrid is asking. */
  taxonomyRepository: TaxonomyRepositoryPort;
  /** Only the author's display name, for an article's byline — absent where no article is being rendered. */
  userRepository?: UserRepositoryPort;
  /** Only the author's picture, for an AuthorBox. */
  mediaStorage?: MediaUrlResolver;
}

/**
 * i18n a livello di campo (see the plan) — resolves every `page` reference
 * (Link/NavLink/Button/Banner/PromoBar/PricingPlan's shared `page` field)
 * across one or more content trees (page content, header, footer — all
 * rendered together, so a single combined lookup dedups any group
 * referenced from more than one of them) into the locale actually being
 * rendered. Fixes a real bug: `pickedPageSchema` used to bake in a
 * specific locale+slug at PICK time, reused verbatim for every locale of
 * the containing block since `page` isn't a `translatable` field — an IT
 * reader could get an EN link.
 *
 * It fills in what a `PageGrid` lists, too, for the same reason and by
 * the same rule: the block stores WHICH pages it wants (a term) and the
 * render pass turns that into what they are. It used to be resolved on
 * the term route alone, so the very thing the block's own description
 * promises — "the three articles in this category, here" — rendered
 * empty on every ordinary page and in every preview. Here it cannot: a
 * new way of serving a page gets it without knowing it exists.
 *
 * It also expands section instances, and it does that FIRST (docs/adr/0059).
 * The order is not a detail: a reusable section can hold a Link, and that
 * link has to be resolved in the locale being rendered like any other.
 * Resolving links first and expanding sections afterwards would produce a
 * page whose section links all pointed nowhere — with nothing failing, on
 * exactly the pages that used a section. Doing both here, rather than
 * leaving the caller to sequence them, is what makes that impossible to
 * get wrong at the four call sites.
 */
export async function resolvePageContentReferences(
  deps: ResolvePageContentReferencesDeps,
  tenantId: string,
  siteId: string,
  locale: string,
  rawContents: PageContent[],
  /**
   * How to find out which page these trees belong to, when they belong to
   * one: an article's own blocks (its date, its neighbours, what is
   * related to it) can only be filled in by something that knows.
   *
   * A function and not a value, because answering it costs a read of the
   * page's own row, and almost no page carries one of those blocks — it
   * is called only once one is actually there. Absent for the header and
   * footer, and for a term's own route.
   */
  currentArticle?: () => Promise<CurrentArticle | null>,
): Promise<PageContent[]> {
  const expanded = await resolveSectionInstances(deps, tenantId, rawContents);
  // Before the grids, not after: a filter says which terms are on offer,
  // and every entry of every grid then has to carry the ones it answers
  // to. Asked the other way round the grids would be filled already, and
  // narrowing them would be a second pass over the same lists.
  const { contents: withFilters, slugsByGroup } = await resolveTermLists(
    deps,
    tenantId,
    locale,
    expanded,
  );
  // After the sections and before the links, so a grid inside a reusable
  // section is filled like any other, and its own links are resolved
  // after it exists.
  const contents = await resolvePageGridItems(
    deps,
    tenantId,
    siteId,
    locale,
    withFilters,
    slugsByGroup,
  );

  // Pure, and needs only the page's own headings — after the sections, so
  // a heading inside a reusable section is a heading of the page too.
  const withContents = resolveTableOfContents(contents);

  // After the grids and before the links, for the grids' own reason: an
  // article block inside a reusable section is filled like any other, and
  // whatever it links to is resolved afterwards. The page's own row is read
  // once, and only when a block actually needs to know which page this is.
  const needsCurrentPage =
    hasArticleBlocks(withContents) || hasSiteNavigationBlocks(withContents);
  const article =
    currentArticle && needsCurrentPage ? await currentArticle() : null;
  const withArticle =
    article && hasArticleBlocks(withContents)
      ? await resolveArticleBlocks(
          deps,
          tenantId,
          siteId,
          locale,
          article,
          withContents,
        )
      : withContents;
  const withNavigation = await resolveSiteNavigationBlocks(
    deps,
    tenantId,
    siteId,
    locale,
    article?.pageGroupId ?? null,
    withArticle,
  );

  const referencedGroupIds = new Set<string>();
  for (const content of withNavigation) {
    for (const groupId of collectPageGroupReferences(content)) {
      referencedGroupIds.add(groupId);
    }
  }
  if (referencedGroupIds.size === 0) {
    return withNavigation;
  }

  // Memoised across the whole pass: a navigation menu of eight links into
  // the same section asks for that section's translation eight times
  // otherwise, once per link, on every request.
  const translationCache = new Map<string, Promise<{ slug: string } | null>>();
  function translationOf(groupId: string): Promise<{ slug: string } | null> {
    let pending = translationCache.get(groupId);
    if (!pending) {
      pending = deps.pageTranslationRepository
        .findByGroupAndLocale(tenantId, groupId, locale)
        .then((found) => (found ? { slug: found.slug } : null));
      translationCache.set(groupId, pending);
    }
    return pending;
  }

  const ancestry = PageAncestry.fromRepository(
    deps.pageGroupRepository,
    tenantId,
  );
  const slugByGroupId: PageGroupSlugMap = new Map();
  await Promise.all(
    [...referencedGroupIds].map(async (pageGroupId) => {
      const translation = await translationOf(pageGroupId);
      if (!translation) {
        return;
      }
      const group = await deps.pageGroupRepository.findById(
        tenantId,
        pageGroupId,
      );
      // An ancestor with no translation means no URL reaches this page in
      // this locale at all — the top-down walk would stop at the missing
      // segment. Leaving it out of the map makes the reference resolve to
      // `null`, which every block already renders as "no link", rather
      // than as a link to a 404.
      const ancestorSlugs = await ancestry.slugsDownTo(
        group?.parentId ?? null,
        async (ancestorId) => (await translationOf(ancestorId))?.slug,
      );
      if (ancestorSlugs === null) {
        return;
      }
      slugByGroupId.set(pageGroupId, {
        locale,
        slug: translation.slug,
        ancestorSlugs,
      });
    }),
  );

  return withNavigation.map((content) =>
    resolvePageReferences(content, slugByGroupId),
  );
}

/**
 * The same pass for one tree: a page, a term's landing, an author's
 * archive, a section on its own. Its callers used to take the first of a
 * one-element list; this says what they mean, and a pass that came back
 * without the tree it was given is refused here once instead of being
 * read as an absent value at every one of them.
 */
export async function resolvePageContent(
  deps: ResolvePageContentReferencesDeps,
  tenantId: string,
  siteId: string,
  locale: string,
  content: PageContent,
  currentArticle?: () => Promise<CurrentArticle | null>,
): Promise<PageContent> {
  const [resolved] = await resolvePageContentReferences(
    deps,
    tenantId,
    siteId,
    locale,
    [content],
    currentArticle,
  );
  if (resolved === undefined) {
    throw new Error('Resolving one content tree returned none.');
  }
  return resolved;
}
