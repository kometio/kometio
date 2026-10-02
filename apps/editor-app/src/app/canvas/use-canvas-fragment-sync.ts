import { useRef } from 'react';
import {
  collectSectionReferences,
  hasServerFilledBlock,
  findBlockById,
  type Block,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { renderBlockFragment } from '../../lib/block-fragment-api-client';
import type {
  BlockTreeBridge,
  CanvasFragmentSync,
} from './block-tree-mutation-types';
import {
  containsSectionInstance,
  hasId,
  parentRenderedFromChildren,
  type IdentifiedBlock,
} from './use-block-tree';

/**
 * Turns for the canvas syncs of ONE history entry: starting a sync makes
 * any earlier one of the same entry stale, and the stale one drops what it
 * was about to graft once its fragment comes back.
 *
 * A sync that renders first and grafts later is not over when it returns.
 * Undo arriving in between removed the blocks, and the fragments still on
 * their way were then inserted anyway: blocks on the canvas that are not in
 * the tree, and after a redo, the same block twice.
 *
 * Per entry and not for the whole history, deliberately: undoing one insert
 * must not cancel a different insert still rendering.
 */
export function syncTurns(): () => () => boolean {
  let turn = 0;
  return () => {
    const mine = ++turn;
    return () => turn === mine;
  };
}

const ALWAYS_CURRENT = () => true;

/**
 * Keeping the live canvas in step with the tree: rendering a block's
 * fragment on the server and grafting it in, re-rendering a container whose
 * children changed, and falling back to a reload where no fragment can be
 * patched in. Every one of these is asynchronous, which is what the turns
 * (`syncTurns`, and the one per container below) are for.
 */
export function useCanvasFragmentSync({
  localBlocks,
  registry,
  bridge,
  token,
  pageId,
  fragmentSection,
  reloadCanvas,
  whenSaved,
}: {
  localBlocks: Block[];
  registry: BlockDescriptor[];
  bridge: Pick<BlockTreeBridge, 'patchBlock' | 'insertBlock'>;
  token: string | null;
  pageId: string;
  /** Set only by the reusable-section editor (docs/adr/0059) — the fragment endpoint then validates the token against the section rather than a page. */
  fragmentSection?: { sectionId: string; locale: string };
  reloadCanvas?: () => void;
  /** Resolves when the queued draft saves have landed — awaited before asking the server to render a block whose content it holds. */
  whenSaved?: () => Promise<void>;
}): CanvasFragmentSync {
  /**
   * The last re-render asked for of each container, by its id.
   *
   * Turns are per history entry, which is not enough here: two inserts into
   * the same container are two entries, each with its own counter, and the
   * one whose fragment came back second won — showing the container as it
   * was one change ago. A container only ever shows the newest render asked
   * of it, whichever entry asked. This is the only guard a container needs:
   * an entry's own turn could never decide differently, since every
   * re-render of a container takes a fresh turn here.
   */
  const parentRenderTurns = useRef(new Map<string, number>());

  /**
   * The HTML of one block as the canvas has to show it: with its variant and
   * its own style class, not only its props. The three places that render a
   * fragment here used to pass props alone, so a container re-rendered
   * after gaining a child, or a block pasted or duplicated, lost its looks
   * until a reload.
   */
  function renderFragmentOf(block: IdentifiedBlock, previewToken: string) {
    return renderBlockFragment({
      pageId,
      ...(fragmentSection ?? {}),
      token: previewToken,
      blockId: block.id,
      blockType: block.type,
      props: block.props,
      children: block.children,
      styleOverride: block.styleOverride,
      variant: block.variant,
    });
  }

  /**
   * Regenerates and re-patches a container block in full (the same
   * `editor:patch-block` as a property change) after one of its children was
   * inserted or removed — inserting or removing ONLY that child in the DOM
   * is not enough: the container-resolution heuristic in
   * preview-bridge-client.ts assumes `<slot/>` is the sole content of the
   * container block's root element, which is false for Testimonials
   * (navigation buttons plus an "empty container" placeholder around the
   * slot) and fragile in general for any "chrome" that depends on children
   * being present. `treeWithUpdatedChildren` is the tree the caller already
   * recomputed AFTER the change (unlike `localBlocks`, which stays the one
   * from BEFORE for as long as it is needed).
   */
  async function patchParentBlock(
    parentId: string,
    treeWithUpdatedChildren: Block[],
  ): Promise<void> {
    if (!token) {
      return;
    }
    const parent = findBlockById(treeWithUpdatedChildren, parentId);
    if (!hasId(parent)) {
      return;
    }
    if (needsReload([parent])) {
      reloadCanvas?.();
      return;
    }
    if (containsSectionInstance([parent])) {
      await whenSaved?.();
    }
    const turn = (parentRenderTurns.current.get(parentId) ?? 0) + 1;
    parentRenderTurns.current.set(parentId, turn);
    try {
      const html = await renderFragmentOf(parent, token);
      if (parentRenderTurns.current.get(parentId) === turn) {
        bridge.patchBlock(parent.id, html);
      }
    } catch {
      // It stays in the local tree and in the saved draft, and comes back
      // correct on the next reload — the same behaviour as a network
      // failure in the other branches below.
    }
  }

  /**
   * Whether these blocks can only reach the canvas through a reload.
   *
   * A reusable section's blocks live on the server (docs/adr/0059), and the
   * fragment endpoint grafts them from the ones the PAGE uses — which it
   * learns from the preview payload. So a section already placed on this
   * page renders fine on its own: a copy of it, or one an undo brings back,
   * is patched in like any other block.
   *
   * A section the page does not use yet — one arriving inside a template —
   * is not in that payload, and renders as "not published yet". That is the
   * case still worth a reload: afterwards the page uses it, so the payload
   * has it.
   */
  /** Which reusable sections these blocks place, at any depth. */
  function sectionIdsOf(blocks: Block[]): string[] {
    return [...collectSectionReferences([blocks])];
  }

  /**
   * And the same is true of a block the SERVER fills in — a page list, a
   * filter, an article's own date. What the editor holds is the question
   * ("this term", "at most three"), never the answer, so a fragment
   * rendered from it draws an empty block: the reader of the canvas sees
   * "nothing here" for a list that has ten entries. One reload and the
   * page comes back with them.
   */
  function needsReload(blocks: Block[]): boolean {
    return (
      hasServerFilledBlock(blocks) ||
      sectionIdsOf(blocks).some(
        (sectionId) => !sectionIdsOf(localBlocks).includes(sectionId),
      )
    );
  }

  /** The shared core of every root-level insert: it renders the fragments and asks the bridge to graft them, in order, at an EXPLICIT point (no recomputation of `beforeBlockId` from a "current" state that may no longer be the right one for a later redo — see handleRemoveSelected's syncBackward for the case where this genuinely matters). */
  async function insertBlocksIntoCanvasAt(
    blocks: IdentifiedBlock[],
    parentId: string | null,
    beforeBlockId: string | null,
    isCurrent: () => boolean = ALWAYS_CURRENT,
  ): Promise<void> {
    if (!token) {
      return;
    }
    if (needsReload(blocks)) {
      reloadCanvas?.();
      return;
    }
    // A section's blocks come from the page as the SERVER has it, so the
    // draft has to be there before it is asked to render one.
    if (containsSectionInstance(blocks)) {
      await whenSaved?.();
    }
    // Rendered together, grafted in order and in one go: grafting each as
    // its fragment came back would put them in the order the network chose.
    const rendered = await Promise.allSettled(
      blocks.map((block) => renderFragmentOf(block, token)),
    );
    if (!isCurrent()) {
      return;
    }
    for (const [index, block] of blocks.entries()) {
      const result = rendered[index];
      // A rejected one stays in the local tree and in the saved draft
      // either way (applyLocalChange has already happened) — it will
      // reappear on the canvas at the iframe's next reload, the same
      // behaviour as today for any network failure.
      if (result?.status !== 'fulfilled') {
        continue;
      }
      // What the wrapper around a root block reads: the fragment is the
      // block alone, and the wrapper is built in the iframe.
      bridge.insertBlock(result.value, parentId, beforeBlockId, {
        align: block.align,
        styleOverride: block.styleOverride,
      });
    }
  }

  async function insertBlockIntoCanvasAt(
    block: IdentifiedBlock,
    parentId: string | null,
    beforeBlockId: string | null,
    isCurrent: () => boolean = ALWAYS_CURRENT,
  ): Promise<void> {
    await insertBlocksIntoCanvasAt([block], parentId, beforeBlockId, isCurrent);
  }

  /**
   * Reorders siblings at ANY depth — `parentId: null` for the root,
   * otherwise the id of the container block whose children were dragged
   * (see `computeNestedReorder` in layers-panel.tsx, its only caller).
   * `moveBlock` with the same `parentId` for every id already handles both
   * the root and the nested case, so no separate branch is needed here —
   * the same reason `handleMoveSelected` below already works at any depth
   * through `locateBlock`.
   */
  /**
   * Re-renders one block from the tree given and patches it into the live
   * canvas — the same `editor:patch-block` a property change already sends,
   * only driven by a tree we are moving *to* rather than one the user just
   * typed into. A failure leaves the canvas one step behind visually and
   * loses nothing: `undo` has already restored and saved the real tree.
   */
  function patchBlockFromTree(tree: Block[], blockId: string): void {
    // Undoing a renamed glossary term has to put the index back too: the
    // same parent an edit re-renders is the one its undo re-renders.
    const block =
      parentRenderedFromChildren(tree, registry, blockId) ??
      findBlockById(tree, blockId);
    // Without a preview token the fragment cannot be rendered — the same
    // guard patchParentBlock makes. Undo still restores and saves the tree;
    // only the live canvas stays behind until the next reload.
    if (!token || !hasId(block)) {
      return;
    }
    // The same rule every other render here follows: a section's blocks are
    // not in this tree, so a fragment would come back saying the section is
    // not published.
    if (needsReload([block])) {
      reloadCanvas?.();
      return;
    }
    void renderFragmentOf(block, token)
      .then((html) => bridge.patchBlock(block.id, html))
      .catch(() => {
        /* see the comment above — the tree is already correct and saved. */
      });
  }

  return {
    patchParentBlock,
    insertBlocksIntoCanvasAt,
    insertBlockIntoCanvasAt,
    patchBlockFromTree,
  };
}
