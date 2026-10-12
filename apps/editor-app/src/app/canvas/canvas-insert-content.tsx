import type { BlockDescriptor } from '@kometio/block-registry';
import {
  BlockPicker,
  type BlockDragHandlers,
  type BlockPickerCategory,
} from './block-picker';
import { TemplatePicker } from './template-picker';
import type { IdentifiedBlock } from './use-block-tree';

export interface CanvasInsertContentProps {
  categories: BlockPickerCategory[];
  registry: BlockDescriptor[];
  /** Off until the canvas has loaded: a block inserted before the page listens is saved but never drawn, until a reload. */
  ready: boolean;
  canInsertType: (type: string) => boolean;
  onInsert: (descriptor: BlockDescriptor) => void;
  /** Absent where dragging onto the canvas is not possible: it needs the canvas beside the palette, which a sheet over it is not. */
  drag: BlockDragHandlers | undefined;
  /** Present when templates may be offered (not inside the section editor). */
  templates?: {
    siteId: string;
    onInsert: (blocks: IdentifiedBlock[]) => void;
  };
}

/**
 * The palette: the blocks by category and, where it makes sense, the page
 * templates. The body of the left panel's Insert view and of the phone's Add
 * sheet.
 */
export function CanvasInsertContent({
  categories,
  registry,
  ready,
  canInsertType,
  onInsert,
  drag,
  templates,
}: CanvasInsertContentProps) {
  return (
    <>
      <BlockPicker
        categories={categories}
        registry={registry}
        onInsert={onInsert}
        canInsert={(descriptor) => canInsertType(descriptor.type)}
        drag={drag}
        disabled={!ready}
      />
      {/* Not inside the section editor: a template dropped into a
          section would be a copy inside a thing that already IS the
          shared original, which is a muddle rather than a feature. */}
      {templates && (
        <TemplatePicker
          siteId={templates.siteId}
          onInsert={templates.onInsert}
          disabled={!ready}
        />
      )}
    </>
  );
}
