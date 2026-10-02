import type { Block, FieldValueOverlay } from '@kometio/shared-types';

/**
 * Answers "is this field's value rich text?" for one block type. Supplied
 * by the caller rather than read from a registry here, because the two
 * callers know DIFFERENT sets of blocks and neither set is wrong:
 *
 * - the API knows the core blocks (`@kometio/block-registry`);
 * - the public site knows those AND the ones the active theme adds, which
 *   are TypeScript modules under `themes/<name>/blocks/` picked up by
 *   `import.meta.glob` at build time — a compiled Node process cannot
 *   load them at runtime, which is why the API alone cannot be the only
 *   place this happens.
 */
export type IsRichTextField = (blockType: string, fieldKey: string) => boolean;

/**
 * Applies `transform` to every rich text value in a content tree, leaving
 * every other prop exactly as it was.
 *
 * One walker for two jobs, because they are the same traversal: the API
 * passes `sanitizeRichText`, and the renderer passes sanitising plus the
 * resolution of internal page links.
 *
 * Returns the original array when nothing changed, so an unchanged tree
 * keeps its identity and callers can skip work on it.
 */
export function transformRichTextInContent(
  blocks: Block[],
  isRichTextField: IsRichTextField,
  transform: (value: string) => string,
): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    const children = block.children
      ? transformRichTextInContent(block.children, isRichTextField, transform)
      : undefined;
    let props = block.props;
    for (const [key, value] of Object.entries(block.props)) {
      if (typeof value !== 'string' || !isRichTextField(block.type, key)) {
        continue;
      }
      const transformed = transform(value);
      if (transformed !== value) {
        props = props === block.props ? { ...block.props } : props;
        props[key] = transformed;
      }
    }
    if (props === block.props && children === block.children) {
      return block;
    }
    changed = true;
    return { ...block, props, ...(children ? { children } : {}) };
  });
  return changed ? next : blocks;
}

/**
 * The same job for the per-locale translation overlay
 * (`Record<blockId, Record<fieldKey, string>>`), which holds field values
 * OUTSIDE the content tree and so is a second entrance of its own.
 *
 * It needs `blockTypeById` — built from the group's content — because the
 * overlay records a block ID and not a type, and the type is what says
 * whether a field is rich text. Sanitising every value instead would be
 * destructive: `Code.code` is deliberately `translatable` (a real case
 * found in the docs-showcase content, where snippets carry comments in
 * the reader's language), so it lives here too, and a snippet containing
 * `if (a < b)` would come back with everything from `<` onwards eaten as
 * a tag.
 *
 * A block ID the tree does not contain is left alone: it is an orphan
 * value for a block that has since been deleted, and guessing at its type
 * would be worse than leaving a value nothing renders.
 */
export function transformRichTextInOverlay(
  overlay: FieldValueOverlay,
  blockTypeById: Map<string, string>,
  isRichTextField: IsRichTextField,
  transform: (value: string) => string,
): FieldValueOverlay {
  const next: FieldValueOverlay = {};
  for (const [blockId, fields] of Object.entries(overlay)) {
    const blockType = blockTypeById.get(blockId);
    const nextFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      nextFields[key] =
        blockType && isRichTextField(blockType, key) ? transform(value) : value;
    }
    next[blockId] = nextFields;
  }
  return next;
}

/** blockId -> block type, for the whole tree including nested children. */
export function blockTypesById(blocks: Block[]): Map<string, string> {
  const types = new Map<string, string>();
  function walk(list: Block[]): void {
    for (const block of list) {
      if (block.id) {
        types.set(block.id, block.type);
      }
      if (block.children) {
        walk(block.children);
      }
    }
  }
  walk(blocks);
  return types;
}
