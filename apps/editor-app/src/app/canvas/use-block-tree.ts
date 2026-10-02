import {
  type Block,
  type BlockAlign,
  type ResponsiveBlockStyle,
  findBlockById,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';

/**
 * How many columns a new Columns block starts with. Two, because it is the
 * layout somebody reaches for a row of columns to build, and because
 * neither of them declares a width: they simply split the row.
 */
const DEFAULT_COLUMN_COUNT = 2;

export interface BlockTreeTarget {
  /** `null` = alla radice dell'albero (pagina o header/footer). */
  parentId: string | null;
  index: number;
}

/**
 * Pure mutations over `Block[]`, all addressed by id (never by positional
 * index in the array, whose meaning would change on every reorder) — see
 * the visual editor plan, Day 3. Every function returns a new tree; none
 * mutates its input.
 */

export type IdentifiedBlock = Block & { id: string };

/** A block with an id is one the editor can select, move and patch. */
export function hasId(block: Block | null): block is IdentifiedBlock {
  return Boolean(block?.id);
}

/** Merges the new props over the existing ones — a property change from the Inspector never touches the other fields. */
export function updateBlockProps(
  blocks: Block[],
  blockId: string,
  props: Record<string, unknown>,
): Block[] {
  return blocks.map((block) => {
    if (block.id === blockId) {
      return { ...block, props: { ...block.props, ...props } };
    }
    if (block.children) {
      return {
        ...block,
        children: updateBlockProps(block.children, blockId, props),
      };
    }
    return block;
  });
}

/**
 * Sets (or clears, with `undefined`) which of the type's declared looks
 * this block wears (ADR-0047). A field of the block, not a prop — see
 * `Block.variant` for why that distinction is the point.
 */
export function updateBlockVariant(
  blocks: Block[],
  blockId: string,
  variant: string | undefined,
): Block[] {
  return blocks.map((block) => {
    if (block.id === blockId) {
      const next = { ...block };
      if (variant === undefined) {
        delete next.variant;
      } else {
        next.variant = variant;
      }
      return next;
    }
    if (block.children) {
      return {
        ...block,
        children: updateBlockVariant(block.children, blockId, variant),
      };
    }
    return block;
  });
}

/**
 * Sets (or clears, with `undefined`) how much page width a ROOT block
 * claims (ADR-0049). A field of the block like `variant`, and cleared the
 * same way: `content` is the default and is stored as the field's absence,
 * so a page does not carry a value on every block saying "behave
 * normally".
 */
export function updateBlockAlign(
  blocks: Block[],
  blockId: string,
  align: BlockAlign | undefined,
): Block[] {
  // Root level only, deliberately: this is the one block field that is
  // meaningless deeper down (a nested block is laid out by its container),
  // so there is no recursion into `children` here — unlike every other
  // helper in this file. A stray id simply matches nothing.
  return blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }
    const next = { ...block };
    if (align === undefined) {
      delete next.align;
    } else {
      next.align = align;
    }
    return next;
  });
}

/** Replaces `styleOverride` wholesale (docs/adr/0022) — a single panel edits all of it at once, the same "replaces, does not merge field by field" as Site.updateThemeTokens, not a merge like updateBlockProps above. The value covers EVERY breakpoint (ADR-0047): merging one size into the others is `withBreakpointStyle`'s job, done before this is called. */
export function updateBlockStyleOverride(
  blocks: Block[],
  blockId: string,
  styleOverride: ResponsiveBlockStyle,
): Block[] {
  return blocks.map((block) => {
    if (block.id === blockId) {
      return { ...block, styleOverride };
    }
    if (block.children) {
      return {
        ...block,
        children: updateBlockStyleOverride(
          block.children,
          blockId,
          styleOverride,
        ),
      };
    }
    return block;
  });
}

export function removeBlock(blocks: Block[], blockId: string): Block[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) =>
      block.children
        ? { ...block, children: removeBlock(block.children, blockId) }
        : block,
    );
}

/** `target.parentId` has to exist in the tree already (or be `null` for the root) — an unknown parentId leaves the tree unchanged rather than throwing. */
export function insertBlock(
  blocks: Block[],
  newBlock: Block,
  target: BlockTreeTarget,
): Block[] {
  if (target.parentId === null) {
    const next = blocks.slice();
    next.splice(target.index, 0, newBlock);
    return next;
  }
  return blocks.map((block) => {
    if (block.id === target.parentId) {
      const children = block.children ? block.children.slice() : [];
      children.splice(target.index, 0, newBlock);
      return { ...block, children };
    }
    if (block.children) {
      return {
        ...block,
        children: insertBlock(block.children, newBlock, target),
      };
    }
    return block;
  });
}

/**
 * Reorder and move: removes the block from wherever it is and reinserts it
 * at the new position, keeping its existing `children`. An unknown
 * `blockId` leaves the tree untouched.
 */
export function moveBlock(
  blocks: Block[],
  blockId: string,
  target: BlockTreeTarget,
): Block[] {
  const block = findBlockById(blocks, blockId);
  if (!block) {
    return blocks;
  }
  const withoutBlock = removeBlock(blocks, blockId);
  return insertBlock(withoutBlock, block, target);
}

/**
 * Finds a block and returns its position as a `BlockTreeTarget` —
 * `parentId: null` when it is top-level, otherwise the id of its real
 * parent in the tree (which "Duplicate block" needs in order to reinsert
 * the copy as a sibling, at the same level as the original, even when that
 * level is inside a Container/Columns). `null` when `id` is not in the
 * tree.
 */
export function locateBlock(
  blocks: Block[],
  id: string,
): BlockTreeTarget | null {
  const index = blocks.findIndex((block) => block.id === id);
  if (index !== -1) {
    return { parentId: null, index };
  }
  for (const block of blocks) {
    if (!block.children) {
      continue;
    }
    const found = locateBlock(block.children, id);
    if (found) {
      return found.parentId === null
        ? { parentId: block.id ?? null, index: found.index }
        : found;
    }
  }
  return null;
}

/**
 * Whether a block of `parent`'s type may hold a child of `childType` —
 * the descriptor's own rule, and the only place it is read.
 *
 * Not a container: nothing. A container with no `allowedChildTypes`
 * (Container, Column): anything. A container with a list (Testimonials →
 * Testimonial, Tabs → Tab): exactly those. The Layers panel, inserting
 * from the picker, dropping a template, pasting and dragging from the
 * sidebar all ask this, so no path can put a Heading inside a list of
 * testimonials that another path would have refused.
 */
export function canHoldChild(
  parent: BlockDescriptor | undefined,
  childType: string,
): boolean {
  if (!parent?.isContainer) {
    return false;
  }
  return (
    !parent.allowedChildTypes || parent.allowedChildTypes.includes(childType)
  );
}

/**
 * The nearest position at or above `target` where every one of `childTypes`
 * may sit.
 *
 * `target` stands when its parent accepts them all. Otherwise it steps out
 * of that parent and lands right AFTER it, one level up, and asks again —
 * so a Heading aimed inside Testimonials goes just below the Testimonials,
 * beside what the person was looking at, rather than vanishing to the end
 * of the page. The root accepts anything, so the walk always ends.
 */
/**
 * Whether a block of `childType` may sit under `parentType` — `null` being
 * the page's own top level.
 *
 * Both ends have a say. A container declares what it takes
 * (`allowedChildTypes`), and a child declares where it belongs
 * (`allowedParentTypes`): a Tab outside Tabs is a panel with no tab to open
 * it, a Column outside Columns is a plain box with no width of its own. The
 * top level takes anything that does not name a parent.
 */
export function canPlace(
  registry: BlockDescriptor[],
  parentType: string | null,
  childType: string,
): boolean {
  const child = registry.find((d) => d.type === childType);
  if (
    child?.allowedParentTypes &&
    !(parentType !== null && child.allowedParentTypes.includes(parentType))
  ) {
    return false;
  }
  if (parentType === null) {
    return true;
  }
  return canHoldChild(
    registry.find((d) => d.type === parentType),
    childType,
  );
}

export function nearestTargetThatHolds(
  blocks: Block[],
  registry: BlockDescriptor[],
  target: BlockTreeTarget,
  childTypes: string[],
): BlockTreeTarget | null {
  let current = target;
  while (current.parentId !== null) {
    const parent = findBlockById(blocks, current.parentId);
    const parentLocation = locateBlock(blocks, current.parentId);
    if (!parent || !parentLocation) {
      // A parent that is not in the tree is no place to insert at all.
      current = { parentId: null, index: blocks.length };
      break;
    }
    if (childTypes.every((type) => canPlace(registry, parent.type, type))) {
      return current;
    }
    current = {
      parentId: parentLocation.parentId,
      index: parentLocation.index + 1,
    };
  }
  // The top level is the last candidate, and it can refuse too: a block
  // that names its parents has nowhere to go once none of them is left.
  return childTypes.every((type) => canPlace(registry, null, type))
    ? current
    : null;
}

/**
 * The block the canvas has to re-render after `id` changed: its parent,
 * when the parent draws from its children's props
 * (`BlockDescriptor.rendersFromChildren`), otherwise nothing — the block
 * itself is enough. Read from `blocks`, which must already hold the change.
 */
export function parentRenderedFromChildren(
  blocks: Block[],
  registry: BlockDescriptor[],
  id: string,
): IdentifiedBlock | null {
  const ancestry = blockAncestry(blocks, id);
  const parent = ancestry[ancestry.length - 2] ?? null;
  if (!hasId(parent)) {
    return null;
  }
  return registry.find((d) => d.type === parent.type)?.rendersFromChildren
    ? parent
    : null;
}

export function blockAncestry(blocks: Block[], id: string): Block[] {
  for (const block of blocks) {
    if (block.id === id) {
      return [block];
    }
    if (block.children) {
      const below = blockAncestry(block.children, id);
      if (below.length > 0) {
        return [block, ...below];
      }
    }
  }
  return [];
}

/**
 * The current siblings at a point in the tree — `null` = the root,
 * otherwise block `parentId`'s `children` (`[]` when it has no children
 * yet, or when `parentId` does not exist). canvas-editor-shell.tsx needs it
 * to know which block will end up IMMEDIATELY AFTER a new insert (see
 * `EditorInsertBlockMessage.beforeBlockId`), before applying that insert to
 * the local tree.
 */
export function siblingsAt(blocks: Block[], parentId: string | null): Block[] {
  if (parentId === null) {
    return blocks;
  }
  return findBlockById(blocks, parentId)?.children ?? [];
}

/**
 * Whether a reusable section is placed anywhere in these blocks, at any
 * depth. Its blocks are not in the page tree — they are grafted on when the
 * page is read (docs/adr/0059) — so nothing rendered from the tree alone can
 * show them.
 */
export function containsSectionInstance(blocks: Block[]): boolean {
  return blocks.some(
    (block) =>
      block.type === 'Section' || containsSectionInstance(block.children ?? []),
  );
}

/**
 * The ids of a flat list of blocks, in order — the form both the preview
 * bridge (`reorderBlocks`) and `handleReorder` speak in.
 *
 * `Block.id` is optional (see content-model.ts: a transitional window for
 * content written before the backfill), so this has to say what happens to
 * a block that has none. It is DROPPED rather than cast away, which is
 * safe here because a block with no id cannot take part in reordering at
 * all: `rootRects` in canvas-editor-shell.tsx already skips it, so it is
 * never draggable and never a drop target. Casting instead would put an
 * `undefined` into a `string[]` and hand it to `moveBlock`, which is the
 * silent-failure shape this codebase keeps getting caught by.
 */
export function blockIds(blocks: Block[]): string[] {
  return blocks
    .map((block) => block.id)
    .filter((id): id is string => id !== undefined);
}

/** Every block in the tree, at every depth: what a person sees added. */
export function countBlocks(blocks: Block[]): number {
  return blocks.reduce(
    (total, block) => total + 1 + countBlocks(block.children ?? []),
    0,
  );
}

/**
 * A deep clone with NEW ids on every node (including every nested child,
 * recursively) — never the original's ids, or two different blocks would
 * share one id in the tree (fragment patching, dragging and reordering are
 * all addressed by id, see the visual editor plan). Props are copied by
 * value (shallow), not shared with the original.
 */
export function cloneBlockWithNewIds(block: Block): Block & { id: string } {
  return {
    ...block,
    id: crypto.randomUUID(),
    props: { ...block.props },
    ...(block.children
      ? { children: block.children.map(cloneBlockWithNewIds) }
      : {}),
  };
}

/**
 * Builds a new block from its descriptor — "seeded" with children where it
 * makes sense to show a real example straight away instead of an empty
 * container (user feedback: an empty collection container with nothing
 * inside is confusing and does not invite building on it). The rule:
 * - Columns starts out with two columns, neither of which declares a
 *   width: `resolveColumnSpans` splits the row equally between whatever
 *   columns are there, so two is a starting point rather than a layout
 *   the user then has to undo (ADR-0050).
 * - A container with exactly ONE type in `allowedChildTypes`
 *   (Testimonials→Testimonial, Team→Member, Accordion→Question, ...) starts
 *   with ONE child of that type — it is the only sensible type, so there is
 *   no ambiguity to ask the user about.
 * - A generic container (Container/Column, no `allowedChildTypes` — meant
 *   to hold anything) stays empty: there is no "canonical child" to guess,
 *   and it would only show an arbitrary example.
 */
export function createBlockFromDescriptor(
  descriptor: BlockDescriptor,
  registry: BlockDescriptor[],
): Block & { id: string } {
  const block: Block & { id: string } = {
    id: crypto.randomUUID(),
    type: descriptor.type,
    props: descriptor.defaultProps,
  };
  if (!descriptor.isContainer) {
    return block;
  }
  if (descriptor.type === 'Columns') {
    const columnDescriptor = registry.find((d) => d.type === 'Column');
    return {
      ...block,
      children: columnDescriptor
        ? Array.from({ length: DEFAULT_COLUMN_COUNT }, () =>
            createBlockFromDescriptor(columnDescriptor, registry),
          )
        : [],
    };
  }
  if (descriptor.allowedChildTypes?.length === 1) {
    const childDescriptor = registry.find(
      (d) => d.type === descriptor.allowedChildTypes?.[0],
    );
    return {
      ...block,
      children: childDescriptor
        ? [createBlockFromDescriptor(childDescriptor, registry)]
        : [],
    };
  }
  return { ...block, children: [] };
}
