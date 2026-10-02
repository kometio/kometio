import type { Block, BlockRect } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  blockAncestry,
  hasId,
  locateBlock,
  type IdentifiedBlock,
} from './use-block-tree';
import { findBlockById } from '@kometio/shared-types';

export interface CanvasSelection {
  /** The block the toolbar acts on — the last one picked. */
  selectedBlock: Block | null;
  selectedDescriptor: BlockDescriptor | undefined;
  /** The whole selection, in pick order. */
  selectedBlocks: IdentifiedBlock[];
  /** The trail the toolbar shows, already labelled. */
  selectedAncestry: { id: string; label: string }[];
  selectedRect: BlockRect | undefined;
  /** Governs insert-before/after and the width/align field, both of which only a top-level block has. */
  isSelectedRootLevel: boolean;
  canMoveSelectedUp: boolean;
  canMoveSelectedDown: boolean;
}

/**
 * Everything the editor chrome needs to know about what is selected,
 * derived from the tree and the bridge on every render.
 *
 * A plain function rather than a hook: it holds no state and calls no hook,
 * and naming it `use…` would promise React something it does not do.
 */
export function describeSelection(
  localBlocks: Block[],
  bridge: {
    selectedBlockId: string | null;
    selectedBlockIds: string[];
    blockRects: BlockRect[];
  },
  registry: BlockDescriptor[],
  tLabel: (key: string) => string,
): CanvasSelection {
  const selectedBlock = bridge.selectedBlockId
    ? findBlockById(localBlocks, bridge.selectedBlockId)
    : null;
  const selectedDescriptor = selectedBlock
    ? registry.find((d) => d.type === selectedBlock.type)
    : undefined;
  // A block whose id is no longer in the tree — deleted, or undone away —
  // simply drops out rather than reaching a mutation that would not find it.
  const selectedBlocks = bridge.selectedBlockIds.flatMap((id) => {
    const block = findBlockById(localBlocks, id);
    return hasId(block) ? [block] : [];
  });
  // A step whose block has no id cannot be selected, so it is dropped
  // rather than rendered as a dead word.
  const selectedAncestry = bridge.selectedBlockId
    ? blockAncestry(localBlocks, bridge.selectedBlockId).flatMap((block) =>
        block.id
          ? [
              {
                id: block.id,
                label: tLabel(
                  registry.find((d) => d.type === block.type)?.label ??
                    block.type,
                ),
              },
            ]
          : [],
      )
    : [];
  const selectedRect = bridge.selectedBlockId
    ? bridge.blockRects.find((r) => r.id === bridge.selectedBlockId)
    : undefined;
  const isSelectedRootLevel = selectedBlock?.id
    ? localBlocks.findIndex((b) => b.id === selectedBlock.id) !== -1
    : false;
  // Unlike `isSelectedRootLevel`, moving works at any depth: `locateBlock`
  // finds the real parent even for a nested block.
  const selectedLocation = selectedBlock?.id
    ? locateBlock(localBlocks, selectedBlock.id)
    : null;
  const selectedSiblings = selectedLocation
    ? ((selectedLocation.parentId
        ? findBlockById(localBlocks, selectedLocation.parentId)?.children
        : localBlocks) ?? [])
    : [];

  return {
    selectedBlock,
    selectedDescriptor,
    selectedBlocks,
    selectedAncestry,
    selectedRect,
    isSelectedRootLevel,
    canMoveSelectedUp: selectedLocation ? selectedLocation.index > 0 : false,
    canMoveSelectedDown: selectedLocation
      ? selectedLocation.index < selectedSiblings.length - 1
      : false,
  };
}
