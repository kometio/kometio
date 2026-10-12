import type { ReactNode, RefObject } from 'react';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { BlockBreadcrumb } from './block-breadcrumb';
import { NoSelectionPanel } from './no-selection-panel';
import { PropertiesPanel, type PropertiesPanelProps } from './properties-panel';
import type { CanvasPageMenuItem } from './canvas-top-bar';

export interface CanvasPropertiesContentProps {
  /** Where "Properties" in the toolbar puts the keyboard. */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Whether the canvas has loaded its page. */
  ready: boolean;
  selectedBlock: Block | null;
  selectedDescriptor: BlockDescriptor | undefined;
  /** The trail to the selected block, already labelled. */
  selectedAncestry: readonly { id: string; label: string }[];
  isRootLevel: boolean;
  onSelectBlock: (blockId: string) => void;
  onChangeProp: PropertiesPanelProps['onChangeProp'];
  onChangeVariant: PropertiesPanelProps['onChangeVariant'];
  /** Absent where the block has no width of its own to choose (the header and footer, a nested block). */
  onChangeAlign: PropertiesPanelProps['onChangeAlign'];
  onChangeInstanceStyle: PropertiesPanelProps['onChangeInstanceStyle'];
  typeStyle: PropertiesPanelProps['typeStyle'];
  breakpoint: PropertiesPanelProps['breakpoint'];
  sectionEditing: PropertiesPanelProps['sectionEditing'];
  /** With nothing selected: opens Add. */
  onAddBlock: () => void;
  pageActions: CanvasPageMenuItem[] | undefined;
  noSelectionExtra: ReactNode;
}

/**
 * What the right panel holds: the selected block's properties and the trail
 * to it, or, with nothing selected, what can be done to the page.
 *
 * Moved out of the shell unchanged: it is also the body of the phone's
 * Properties sheet, which is why it is a thing of its own and not inline in
 * the one place it is drawn.
 */
export function CanvasPropertiesContent({
  panelRef,
  ready,
  selectedBlock,
  selectedDescriptor,
  selectedAncestry,
  isRootLevel,
  onSelectBlock,
  onChangeProp,
  onChangeVariant,
  onChangeAlign,
  onChangeInstanceStyle,
  typeStyle,
  breakpoint,
  sectionEditing,
  onAddBlock,
  pageActions,
  noSelectionExtra,
}: CanvasPropertiesContentProps) {
  return (
    /* Where "Properties" in the toolbar puts the keyboard: `tabIndex={-1}`
       so it can take focus without joining the tab order. Inert while the
       canvas loads, like the palette: a property changed now would be
       drawn by a message to a page that is not listening yet. */
    <div
      ref={panelRef}
      tabIndex={-1}
      inert={!ready}
      className={
        ready
          ? 'flex min-h-0 flex-1 flex-col gap-2 outline-none'
          : 'flex min-h-0 flex-1 flex-col gap-2 opacity-60 outline-none'
      }
    >
      {selectedBlock && selectedDescriptor ? (
        <>
          <BlockBreadcrumb
            ancestry={selectedAncestry}
            onSelect={onSelectBlock}
          />
          <PropertiesPanel
            block={selectedBlock}
            descriptor={selectedDescriptor}
            isRootLevel={isRootLevel}
            onChangeProp={onChangeProp}
            onChangeVariant={onChangeVariant}
            onChangeAlign={onChangeAlign}
            onChangeInstanceStyle={onChangeInstanceStyle}
            typeStyle={typeStyle}
            breakpoint={breakpoint}
            sectionEditing={sectionEditing}
          />
        </>
      ) : (
        <NoSelectionPanel
          onAddBlock={onAddBlock}
          pageActions={pageActions}
          extra={noSelectionExtra}
        />
      )}
    </div>
  );
}
