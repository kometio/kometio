import {
  pickedPageSchema,
  type Block,
  type PageContent,
  type PageGridItem,
  type SiteMapNode,
} from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import {
  listPublishedPagePaths,
  toPageGridItem,
  type ListPublishedPagePathsDeps,
  type PublishedPagePath,
} from './list-published-page-paths';

const SITE_NAVIGATION_BLOCK_TYPES = new Set([
  'SubPages',
  'SiblingPages',
  'SiteMap',
]);

function containsNavigationBlock(blocks: PageContent): boolean {
  return blocks.some(
    (block) =>
      SITE_NAVIGATION_BLOCK_TYPES.has(block.type) ||
      (block.children ? containsNavigationBlock(block.children) : false),
  );
}

/** Whether any of these trees asks where the page sits in the site — asked before the site's pages are walked, so a page with none of these blocks pays nothing. */
export function hasSiteNavigationBlocks(contents: PageContent[]): boolean {
  return contents.some(containsNavigationBlock);
}

/** The tree's own order, then the title, so pages with the same position still come out the same way every time. */
function treeOrder(a: PublishedPagePath, b: PublishedPagePath): number {
  return a.order - b.order || a.title.localeCompare(b.title);
}

/**
 * Fills what `SubPages`, `SiblingPages` and `SiteMap` show, from the page
 * tree as it is published in the language being read.
 *
 * Nothing here is typed by anybody: a list of a section's pages kept by
 * hand forgets the next one added, and a "next page" link typed by hand
 * points at the page that USED to come next.
 *
 * `currentPageGroupId` is `null` where there is no page — the header and
 * footer, a term's own route. `SiteMap` does not need one; `SubPages`
 * without a chosen parent and `SiblingPages` then have nothing to say, and
 * draw nothing.
 */
export async function resolveSiteNavigationBlocks(
  deps: ListPublishedPagePathsDeps,
  tenantId: string,
  siteId: string,
  locale: string,
  currentPageGroupId: string | null,
  contents: PageContent[],
): Promise<PageContent[]> {
  if (!hasSiteNavigationBlocks(contents)) return contents;

  const paths = (await listPublishedPagePaths(deps, tenantId, siteId)).filter(
    (path) => path.locale === locale,
  );
  const childrenOf = (parentId: string | null) =>
    paths.filter((path) => path.parentId === parentId).sort(treeOrder);

  const fill = (blocks: PageContent): PageContent =>
    blocks.map((block) => {
      const children = block.children ? fill(block.children) : undefined;
      const next = fillOne(block);
      return children ? { ...next, children } : next;
    });

  function fillOne(block: Block): Block {
    switch (block.type) {
      case 'SubPages': {
        // Parsed, not assumed: `parent` is whatever was saved, and a page
        // picked before a schema change must fall back to this page's own
        // children rather than throw.
        const picked = pickedPageSchema.safeParse(block.props['parent']);
        const parentId = picked.success
          ? picked.data.pageGroupId
          : currentPageGroupId;
        const limit = Number(block.props['limit'] ?? 0);
        const all: PageGridItem[] = parentId
          ? childrenOf(parentId).map((path) => toPageGridItem(path, locale))
          : [];
        const items = limit > 0 ? all.slice(0, limit) : all;
        return { ...block, props: { ...block.props, items } };
      }
      case 'SiblingPages': {
        const current = paths.find(
          (path) => path.groupId === currentPageGroupId,
        );
        if (!current) {
          return {
            ...block,
            props: { ...block.props, previous: null, next: null },
          };
        }
        const siblings = childrenOf(current.parentId);
        const index = siblings.findIndex(
          (path) => path.groupId === current.groupId,
        );
        const before = index > 0 ? siblings[index - 1] : undefined;
        const after = index >= 0 ? siblings[index + 1] : undefined;
        return {
          ...block,
          props: {
            ...block.props,
            previous: before ? toPageGridItem(before, locale) : null,
            next: after ? toPageGridItem(after, locale) : null,
          },
        };
      }
      case 'SiteMap': {
        const depth = Math.min(
          Math.max(Number(block.props['depth'] ?? 3), 1),
          6,
        );
        return {
          ...block,
          props: { ...block.props, tree: buildTree(null, depth) },
        };
      }
      default:
        return block;
    }
  }

  /**
   * The published tree, `depth` levels down.
   *
   * Pages filed in a collection are left out: a collection exists so the
   * tree stays a map of the site rather than an archive of every news item
   * — a site map with two hundred articles in it would undo exactly that.
   */
  function buildTree(parentId: string | null, depth: number): SiteMapNode[] {
    if (depth === 0) return [];
    return childrenOf(parentId)
      .filter((path) => path.collectionId === null)
      .map((path) => ({
        title: path.title,
        path: localePathFromAncestors(locale, path.ancestorSlugs, path.slug),
        children: buildTree(path.groupId, depth - 1),
      }));
  }

  return contents.map(fill);
}
