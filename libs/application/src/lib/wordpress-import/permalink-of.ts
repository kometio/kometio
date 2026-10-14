import type { WordPressExportItem } from '@kometio/ports';
import {
  WORDPRESS_PERMALINK_LIMITS,
  type WordPressPermalink,
} from '@kometio/shared-types';

/**
 * Where an item of the export lived, if anybody could have asked for it.
 *
 * Only what was published: a draft, a private page or one in the bin had no
 * address a visitor or a search engine could have followed, so a rule for it
 * would be a rule for nobody. And only pages and posts, the two things the
 * import brings across — an attachment's address is its file's, and what a
 * plugin makes (a product, an event) has no page to send to.
 *
 * And only what is the size of an address and of a slug: the file is
 * somebody else's, and an entry that is not is not a page of a site.
 */
export function permalinkOf(
  item: WordPressExportItem,
): WordPressPermalink | null {
  if (item.postType !== 'page' && item.postType !== 'post') return null;
  if (item.status !== 'publish') return null;
  if (item.postId === null) return null;
  const link = item.link.trim();
  const slug = item.slug.trim();
  if (link === '' || slug === '') return null;
  if (
    link.length > WORDPRESS_PERMALINK_LIMITS.link ||
    slug.length > WORDPRESS_PERMALINK_LIMITS.slug
  ) {
    return null;
  }
  return {
    id: item.postId,
    type: item.postType,
    slug,
    title: (item.title.trim() || slug).slice(
      0,
      WORDPRESS_PERMALINK_LIMITS.title,
    ),
    link,
    // WordPress writes 0 for "no parent".
    parentId:
      item.parentId !== null && item.parentId > 0 ? item.parentId : null,
  };
}
