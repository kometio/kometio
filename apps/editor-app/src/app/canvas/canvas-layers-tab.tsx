import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { LayerContextMenu } from './layer-context-menu';
import { LayersPanel } from './layers-panel';
import { canPlace } from './use-block-tree';
import type { UseBlockTreeMutationsResult } from './use-block-tree-mutations';
import type { PreviewBridgeState } from './use-preview-bridge';

export interface CanvasLayersTabProps {
  blocks: Block[];
  registry: BlockDescriptor[];
  bridge: Pick<
    PreviewBridgeState,
    | 'hoveredBlockId'
    | 'selectedBlockId'
    | 'selectedBlockIds'
    | 'selectBlock'
    | 'scrollToBlock'
  >;
  /** The icons a block stores that the active theme does not have (ADR-0090), by block id. */
  missingIcons: ReadonlyMap<string, readonly string[]>;
  /** What a generated page left to replace, by block id. */
  placeholders: ReadonlyMap<string, readonly string[]>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: Pick<
    UseBlockTreeMutationsResult,
    | 'handleReorder'
    | 'handleReparent'
    | 'handleDuplicateSelected'
    | 'handleRemoveSelected'
    | 'handleMoveSelected'
  >;
}

/** Layers: the tree, its context menu, and how a pick reaches the canvas. */
export function CanvasLayersTab({
  blocks,
  registry,
  bridge,
  missingIcons,
  placeholders,
  canMoveUp,
  canMoveDown,
  actions,
}: CanvasLayersTabProps) {
  return (
    <LayersPanel
      contextMenu={
        <LayerContextMenu
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onDuplicate={actions.handleDuplicateSelected}
          onDelete={actions.handleRemoveSelected}
          onMoveUp={() => actions.handleMoveSelected(-1)}
          onMoveDown={() => actions.handleMoveSelected(1)}
        />
      }
      blocks={blocks}
      hoveredBlockId={bridge.hoveredBlockId}
      selectedBlockId={bridge.selectedBlockId}
      onReorder={actions.handleReorder}
      onReparent={actions.handleReparent}
      // The descriptors' own rules, as two predicates, so the panel
      // stays free of the registry. `canHoldChild` is the same rule
      // every insert path asks, so the panel cannot refuse a nesting
      // the picker would allow, or the other way round.
      isContainerType={(type) =>
        Boolean(registry.find((d) => d.type === type)?.isContainer)
      }
      canContain={(parentType, childType) =>
        canPlace(registry, parentType, childType)
      }
      selectedBlockIds={bridge.selectedBlockIds}
      missingIcons={missingIcons}
      placeholders={placeholders}
      describeType={(type) =>
        registry.find((descriptor) => descriptor.type === type)
      }
      onSelect={(blockId, additive) => {
        bridge.selectBlock(blockId, additive);
        // Only a plain click scrolls: adding a fourth block to a
        // selection should not yank the canvas away from the
        // three you are looking at.
        if (!additive) {
          bridge.scrollToBlock(blockId);
        }
      }}
    />
  );
}
