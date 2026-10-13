import type { WordPressExportItem } from '@kometio/ports';
import type { WordPressPermalink } from '@kometio/shared-types';

/** Long enough to tell two pages apart in a list, short enough that thousands of them stay small. */
const TITLE_LENGTH = 120;

/**
 * Where an item of the export lived, if anybody could have asked for it.
 *
 * Only what was published: a draft, a private page or one in the bin had no
 * address a visitor or a search engine could have followed, so a rule for it
 * would be a rule for nobody. And only pages and posts, the two things the
 * import brings across — an attachment's address is its file's, and what a
 * plugin makes (a product, an event) has no page to send to.
 */
export function permalinkOf(
  item: WordPressExportItem,
): WordPressPermalink | null {
  if (item.postType !== 'page' && item.postType !== 'post') return null;
  if (item.status !== 'publish') return null;
  if (item.postId === null) return null;
  if (item.link.trim() === '' || item.slug.trim() === '') return null;
  return {
    id: item.postId,
    type: item.postType,
    slug: item.slug.trim(),
    title: (item.title.trim() || item.slug.trim()).slice(0, TITLE_LENGTH),
    link: item.link.trim(),
    // WordPress writes 0 for "no parent".
    parentId:
      item.parentId !== null && item.parentId > 0 ? item.parentId : null,
  };
}
