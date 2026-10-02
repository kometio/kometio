/*
 * The measures a page row and the header above it share: the indent of
 * the tree, and the width of each column, so the two cannot drift apart.
 */

/** What a column with nothing in it shows. */
export const EMPTY_CELL = '—';

/** One indent step in the page tree, and the row height its elbows meet. */
export const PAGE_INDENT = 20;
export const PAGE_ROW_HEIGHT = 48;
/**
 * Where a top-level row starts. It is an inline style, not a padding
 * class, because the indentation is added to it: a `px-4` would be
 * overridden by the inline `paddingLeft` and the root pages would sit
 * flat against the list's border.
 */
export const PAGE_ROW_INSET = 16;
/**
 * The columns to the right of the title, each a fixed width so a row and
 * the header above it line up without a table element (the rows are also
 * a drag-reorder list and a tree, which a <table> makes harder, not
 * easier). Author and date hide on a narrow window rather than squeezing
 * the title they qualify.
 */
export const LOCALES_COLUMN = 'w-28';
/**
 * What is online, in a word.
 *
 * The row said it in colour alone: an amber badge meant "published, and the
 * draft has moved on", and nothing on the screen said so — no legend, no
 * column, no heading. You knew it only if you already knew it.
 */
export const STATUS_COLUMN = 'hidden w-44 md:block';
export const AUTHOR_COLUMN = 'hidden w-36 xl:block';
export const EDITOR_COLUMN = 'hidden w-36 lg:block';
export const UPDATED_COLUMN = 'hidden w-24 lg:block';
/**
 * The box at the start of a row, and the header's "select all" over it: as
 * wide as the strip of a row's own left inset the box sits in.
 */
export const SELECT_COLUMN = 'w-5';
