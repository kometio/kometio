import type {
  Block,
  PageContent,
  PageGridItem,
  PublicAuthor,
} from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import {
  listPublishedPagePaths,
  toPageGridItem,
  type PublishedPagePath,
} from './list-published-page-paths';
import { toPublicAuthor, type MediaUrlResolver } from './author-profile';

export interface ResolveArticleBlocksDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  /** Only for the author's display name — absent on a route that has no article to write a byline for. */
  userRepository?: UserRepositoryPort;
  /** Only for the author's picture, in the AuthorBox. Absent: no picture, the initial is drawn instead. */
  mediaStorage?: MediaUrlResolver;
}

/** The page being rendered, as the article blocks need to know it. */
export interface CurrentArticle {
  pageGroupId: string;
  /** ISO, `null` for a page that has never been published. */
  publishedAt: string | null;
  /** Who created the page — resolved to a display name, never to an email. */
  authorUserId: string | null;
  /** The section that lists it, `null` for a page in the tree itself. */
  collectionId: string | null;
}

const ARTICLE_BLOCK_TYPES = new Set([
  'ArticleMeta',
  'ArticleNav',
  'RelatedPages',
  'AuthorBox',
]);

function hasArticleBlock(blocks: PageContent): boolean {
  return blocks.some(
    (block) =>
      ARTICLE_BLOCK_TYPES.has(block.type) ||
      hasArticleBlock(block.children ?? []),
  );
}

/**
 * Whether any of these trees carries one of the three article blocks.
 *
 * Asked before the page it belongs to is even looked up: filling these
 * blocks needs the page's own row (its author, its section), and almost
 * no page has one of them, so nobody should pay for that read.
 */
export function hasArticleBlocks(contents: PageContent[]): boolean {
  return contents.some(hasArticleBlock);
}

/**
 * The page being rendered, read from its own row.
 *
 * Called only once an article block is actually on the page (see
 * `hasArticleBlocks`), which is why it is a function the caller hands
 * over rather than a value it always computes: the author and the section
 * live on the page group, and reading it for every page of every site
 * would be a query nobody asked for.
 */
export async function currentArticleOf(
  deps: { pageGroupRepository: PageGroupRepositoryPort },
  tenantId: string,
  translation: { pageGroupId: string; publishedAt: Date | null },
): Promise<CurrentArticle | null> {
  const group = await deps.pageGroupRepository.findById(
    tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    return null;
  }
  return {
    pageGroupId: translation.pageGroupId,
    publishedAt: translation.publishedAt
      ? translation.publishedAt.toISOString()
      : null,
    authorUserId: group.createdBy,
    collectionId: group.collectionId,
  };
}

/**
 * Newest first, and a page with no date last.
 *
 * A missing date means "we do not know", not "today": putting such a page
 * at the top of an archive would make the one thing nobody dated the
 * first thing everybody reads.
 */
function newestFirst(a: PublishedPagePath, b: PublishedPagePath): number {
  const left = a.publishedAt?.getTime() ?? null;
  const right = b.publishedAt?.getTime() ?? null;
  if (left === right) return a.title.localeCompare(b.title);
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * Fills in what the three article blocks are saying about the page they
 * sit on: its date and author, its neighbours in the archive, and the
 * other pages filed under the same terms.
 *
 * The same treatment `PageGrid` already gets (resolvePageGridItems): the
 * block stores WHAT it wants, and a render pass turns that into the
 * answer for the page and language actually being rendered. None of it is
 * authorable, and that is the point — a date typed by hand is a second
 * answer to a question the page already answers, and a hand-picked list
 * of related articles is an index that goes stale the day after it is
 * written.
 *
 * Nothing to do on a page with none of the three blocks, which is almost
 * every page: the walk returns early rather than reading the site.
 */
export async function resolveArticleBlocks(
  deps: ResolveArticleBlocksDeps,
  tenantId: string,
  siteId: string,
  locale: string,
  current: CurrentArticle,
  contents: PageContent[],
): Promise<PageContent[]> {
  if (!hasArticleBlocks(contents)) {
    return contents;
  }

  const [authorUser, paths, termIds] = await Promise.all([
    resolveAuthor(deps, tenantId, current.authorUserId),
    listPublishedPagePaths(deps, tenantId, siteId),
    deps.taxonomyRepository.listTermIdsForPageGroup(
      tenantId,
      current.pageGroupId,
    ),
  ]);

  const inThisLanguage = paths.filter((path) => path.locale === locale);
  const author =
    authorUser === null
      ? null
      : toPublicAuthor(authorUser, locale, paths, deps.mediaStorage);
  const neighbours = findNeighbours(inThisLanguage, current, locale);
  const related = await findRelated(
    deps,
    tenantId,
    inThisLanguage,
    termIds,
    current,
    locale,
  );

  return contents.map((content) =>
    fill(
      content,
      {
        publishedAt: current.publishedAt,
        authorName: author?.name ?? '',
        authorPath: author?.path ?? null,
      },
      neighbours,
      related,
      // A person with no name has no byline, and no box to put one in.
      author?.name ? author : null,
    ),
  );
}

/**
 * Who wrote the page. What is published of them is decided by
 * `toPublicAuthor`: the display name, their bio and picture, their author
 * page — never the account's email address. A page whose author never set
 * a name simply carries no byline.
 */
async function resolveAuthor(
  deps: ResolveArticleBlocksDeps,
  tenantId: string,
  userId: string | null,
) {
  if (!userId || !deps.userRepository) {
    return null;
  }
  return deps.userRepository.findById(tenantId, userId);
}

/**
 * The older and the newer page in the same section.
 *
 * A page outside every section has no set to be a neighbour in — its
 * "neighbours" in the page tree are a menu, not an archive — so it gets
 * none rather than whatever happens to sit beside it.
 */
function findNeighbours(
  paths: PublishedPagePath[],
  current: CurrentArticle,
  locale: string,
): { previous: PageGridItem | null; next: PageGridItem | null } {
  if (!current.collectionId) {
    return { previous: null, next: null };
  }
  const ordered = paths
    .filter((path) => path.collectionId === current.collectionId)
    .sort(newestFirst);
  const index = ordered.findIndex(
    (path) => path.groupId === current.pageGroupId,
  );
  if (index === -1) {
    return { previous: null, next: null };
  }
  const older = ordered[index + 1];
  const newer = ordered[index - 1];
  return {
    previous: older ? toPageGridItem(older, locale) : null,
    next: newer ? toPageGridItem(newer, locale) : null,
  };
}

/** Pages sharing at least one term with this one, newest first, itself excluded. */
async function findRelated(
  deps: ResolveArticleBlocksDeps,
  tenantId: string,
  paths: PublishedPagePath[],
  termIds: string[],
  current: CurrentArticle,
  locale: string,
): Promise<PageGridItem[]> {
  if (termIds.length === 0) {
    return [];
  }
  const groupIdLists = await Promise.all(
    termIds.map((termId) =>
      deps.taxonomyRepository.listPageGroupIdsForTerm(tenantId, termId),
    ),
  );
  // A page under two of this article's terms is related once, not twice.
  const sharing = new Set(groupIdLists.flat());
  sharing.delete(current.pageGroupId);
  return paths
    .filter((path) => sharing.has(path.groupId))
    .sort(newestFirst)
    .map((path) => toPageGridItem(path, locale));
}

function fill(
  blocks: PageContent,
  meta: {
    publishedAt: string | null;
    authorName: string;
    authorPath: string | null;
  },
  neighbours: { previous: PageGridItem | null; next: PageGridItem | null },
  related: PageGridItem[],
  author: PublicAuthor | null,
): PageContent {
  return blocks.map((block): Block => {
    const children = block.children
      ? fill(block.children, meta, neighbours, related, author)
      : undefined;
    const withChildren = (next: Block): Block =>
      children ? { ...next, children } : next;

    if (block.type === 'ArticleMeta') {
      return withChildren({ ...block, props: { ...block.props, ...meta } });
    }
    if (block.type === 'ArticleNav') {
      return withChildren({
        ...block,
        props: { ...block.props, ...neighbours },
      });
    }
    if (block.type === 'AuthorBox') {
      return withChildren({
        ...block,
        // Never a profile page here: this is a byline under an article,
        // and the article already has its own title.
        props: { ...block.props, author, isProfilePage: false },
      });
    }
    if (block.type === 'RelatedPages') {
      const limit = block.props['limit'];
      const capped =
        typeof limit === 'number' && limit > 0
          ? related.slice(0, limit)
          : related;
      return withChildren({
        ...block,
        props: { ...block.props, items: capped },
      });
    }
    return children ? { ...block, children } : block;
  });
}
