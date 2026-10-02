import type { Block } from './content-model';

/**
 * The blocks whose content is an ANSWER, filled in when the page is read.
 *
 * They have one thing in common that matters to the editor: their props
 * as stored say what they want, not what they show, so rendering one from
 * the editor's own copy draws an empty block. The canvas reads this list
 * to know that inserting one is a case for a reload rather than a patch.
 */
export const SERVER_FILLED_BLOCK_TYPES = [
  'PageGrid',
  'ArticleMeta',
  'ArticleNav',
  'RelatedPages',
  'TermList',
  'TableOfContents',
  'SubPages',
  'SiblingPages',
  'SiteMap',
  'AuthorBox',
] as const;
export type ServerFilledBlockType = (typeof SERVER_FILLED_BLOCK_TYPES)[number];

/**
 * Which of each block's props ARE the answer — the rest are the question.
 *
 * A block re-rendered on its own in the canvas, after one of its options
 * changed, arrives with the editor's copy of its props: the question as
 * edited, and the answer as it was stored, which is empty. The answer is
 * taken from the page as the server just resolved it instead
 * (buildFragmentBlock), so switching off an author's bio no longer makes
 * the author disappear with it.
 *
 * Typed by the list above, so a block added to it without saying what its
 * answer is does not compile.
 */
export const SERVER_FILLED_PROPS: Readonly<
  Record<ServerFilledBlockType, readonly string[]>
> = {
  PageGrid: ['items'],
  ArticleMeta: ['publishedAt', 'authorName', 'authorPath'],
  ArticleNav: ['previous', 'next'],
  RelatedPages: ['items'],
  TermList: ['choices'],
  TableOfContents: ['entries'],
  SubPages: ['items'],
  SiblingPages: ['previous', 'next'],
  SiteMap: ['tree'],
  AuthorBox: ['author', 'isProfilePage'],
};

export function isServerFilledBlockType(
  type: string,
): type is ServerFilledBlockType {
  return (SERVER_FILLED_BLOCK_TYPES as readonly string[]).includes(type);
}

/** Whether any of these blocks, at any depth, is one the server fills. */
export function hasServerFilledBlock(blocks: readonly Block[]): boolean {
  return blocks.some(
    (block) =>
      isServerFilledBlockType(block.type) ||
      hasServerFilledBlock(block.children ?? []),
  );
}
