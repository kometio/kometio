import {
  rootBlockHoverAttr,
  rootBlockInstanceClassName,
  type Block,
  type BlockAlign,
} from '@kometio/shared-types';

/**
 * The wrapper every ROOT-level block gets, in one place (ADR-0049).
 *
 * It exists twice at runtime and must agree with itself both times:
 * PublicPageContent.astro builds it server-side for the whole page, and
 * preview-bridge-client.ts builds it in the canvas for a block the iframe
 * has never seen. When those two drifted apart, an inserted block simply
 * had no wrapper — no spacing, and since this file gave the wrapper the
 * page's width too, no content column either: it rendered full-bleed until
 * the next reload. Two copies of a structure is how that happens, so there
 * is one.
 */
export const ROOT_BLOCK_CLASS = 'kometio-root-block';

/**
 * `content` is the default the CSS already applies, so it is written as
 * the absence of the attribute rather than as its own value — one less
 * thing in the published HTML of every page that never asked for it.
 */
function rootBlockAlignAttr(
  align: BlockAlign | undefined,
): BlockAlign | undefined {
  return align && align !== 'content' ? align : undefined;
}

export interface RootBlockWrapper {
  classNames: string[];
  align: BlockAlign | undefined;
  hover: string | undefined;
}

/**
 * Everything the wrapper carries for one block: its classes and its two
 * attributes. The class holding the block's own margins and animation
 * (`kometio-rb-<id>`) and the hover attribute used to be written only by the
 * page renderer, so a block inserted on the canvas lost all three until
 * the next reload.
 */
export function rootBlockWrapper(
  block: Pick<Block, 'id' | 'align' | 'styleOverride'>,
): RootBlockWrapper {
  const instanceClass = block.id ? rootBlockInstanceClassName(block.id) : null;
  return {
    classNames: instanceClass
      ? [ROOT_BLOCK_CLASS, instanceClass]
      : [ROOT_BLOCK_CLASS],
    align: rootBlockAlignAttr(block.align),
    hover: rootBlockHoverAttr(block.styleOverride),
  };
}
