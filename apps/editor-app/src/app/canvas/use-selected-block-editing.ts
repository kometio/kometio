import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  rootBlockHoverAttr,
  DEFAULT_VARIANT,
  withBreakpointStyle,
  type Block,
  type BlockStyleOverride,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { siteQueryOptions } from '../settings/site-queries';
import type { Breakpoint } from './breakpoint-selector';
import type { BlockStyleSheet } from './use-block-style-sheet';
import type { PreviewBridgeState } from './use-preview-bridge';
import {
  parentRenderedFromChildren,
  updateBlockProps,
  updateBlockStyleOverride,
  updateBlockVariant,
} from './use-block-tree';
import type { UsePropertyPatchResult } from './use-property-patch';

export interface UseSelectedBlockEditingParams {
  /** Present when the editor has a site to write per-type styles to. */
  siteId: string | undefined;
  selectedBlock: Block | null;
  selectedDescriptor: BlockDescriptor | undefined;
  /** To know whether the selected block's parent draws from its children. */
  registry: BlockDescriptor[];
  breakpoint: Breakpoint;
  /** Only what a style edit needs to tell the iframe: the wrapper attributes of a ROOT block. */
  bridge: Pick<PreviewBridgeState, 'setRootLayout'>;
  /** Shared with the tree mutations, which put styled blocks on the canvas too. */
  styleSheet: BlockStyleSheet;
  localBlocksRef: MutableRefObject<Block[]>;
  setLocalBlocks: Dispatch<SetStateAction<Block[]>>;
  onChange: (blocks: Block[]) => void;
  patch: Pick<
    UsePropertyPatchResult,
    'scheduleChange' | 'scheduleVariantChange' | 'scheduleStyleOverrideChange'
  >;
}

export interface SelectedBlockEditing {
  handleChangeProp: (key: string, value: unknown) => void;
  handleChangeVariant: (variant: string | undefined) => void;
  handleChangeStyleOverride: (styleOverride: BlockStyleOverride) => void;
  /** The per-type style the selected block's variant currently has, `undefined` with no site. */
  typeStyle: ResponsiveBlockStyle | undefined;
}

/**
 * Every edit made to the selected block from its toolbar: a property, the
 * variant it wears, its width on the page, its own style and the style of
 * every block of its type.
 *
 * They share one pattern — show it now, save it after the debounce — and
 * one side effect none of them may forget: the style sheet inside the
 * iframe. A style is a RULE since ADR-0047, not an inline attribute, so
 * re-rendering a block's fragment does not carry it.
 */
export function useSelectedBlockEditing({
  siteId,
  selectedBlock,
  selectedDescriptor,
  registry,
  breakpoint,
  bridge,
  styleSheet,
  localBlocksRef,
  setLocalBlocks,
  onChange,
  patch,
}: UseSelectedBlockEditingParams): SelectedBlockEditing {
  // Only needed to read the per-type style (docs/adr/0022). Every editor
  // that mounts the shell today passes a `siteId`; `enabled` only keeps a
  // future caller without one from fetching.
  const { data: site } = useQuery({
    ...siteQueryOptions(),
    enabled: Boolean(siteId),
  });

  function handleChangeProp(key: string, value: unknown): void {
    // Hoisted to a local: TypeScript drops the narrowing of a PROPERTY as
    // soon as it is read inside a callback.
    const blockId = selectedBlock?.id;
    if (!blockId) {
      return;
    }
    const nextProps = { ...selectedBlock.props, [key]: value };
    setLocalBlocks((prev) => updateBlockProps(prev, blockId, nextProps));
    // A glossary term renamed has to move in its glossary's index, a
    // video's caption is its title in the playlist: the parent is what
    // shows the change, so the parent is what gets re-rendered.
    const parent = parentRenderedFromChildren(
      updateBlockProps(localBlocksRef.current, blockId, nextProps),
      registry,
      blockId,
    );
    patch.scheduleChange(
      blockId,
      selectedBlock.type,
      key,
      nextProps,
      selectedBlock.children,
      // Without these the re-rendered fragment comes back stripped of its
      // per-instance class and its variant class, so editing a label made
      // the block lose its styling in the canvas until a reload.
      {
        styleOverride: selectedBlock.styleOverride,
        variant: selectedBlock.variant,
      },
      parent ?? undefined,
    );
  }

  /** Which of the type's declared looks the selected block wears (ADR-0047) — a field of the block, so it travels the same route as the per-instance override rather than through `props`. */
  function handleChangeVariant(variant: string | undefined): void {
    const blockId = selectedBlock?.id;
    if (!blockId) {
      return;
    }
    setLocalBlocks((prev) => updateBlockVariant(prev, blockId, variant));
    patch.scheduleVariantChange(
      blockId,
      selectedBlock.type,
      selectedBlock.props,
      variant,
      selectedBlock.children,
      selectedBlock.styleOverride,
    );
  }

  /**
   * The fields edit ONE size at a time — whichever the breakpoint selector
   * shows — and that flat override is merged back into the block's
   * per-breakpoint style here, so the fields stay a plain editor of a flat
   * override.
   */
  function handleChangeStyleOverride(styleOverride: BlockStyleOverride): void {
    const blockId = selectedBlock?.id;
    if (!blockId) {
      return;
    }
    const next = withBreakpointStyle(
      selectedBlock.styleOverride,
      breakpoint,
      styleOverride,
    );
    setLocalBlocks((prev) => updateBlockStyleOverride(prev, blockId, next));
    // Built here and handed over: the sheet used to read the draft ref,
    // which only catches up after the next render — so every style edit
    // sent the sheet as it was BEFORE that edit, and a control that fires
    // once (a swatch, a select) showed the previous value.
    const nextTree = updateBlockStyleOverride(
      localBlocksRef.current,
      blockId,
      next,
    );
    styleSheet.refresh(nextTree);
    // The hover effect is an ATTRIBUTE on the wrapper around a root block,
    // not a rule (it is two declarations and a transition, so no custom
    // property can hold it) — re-rendering the block would not carry it,
    // and the page had only ever written it server-side. Changing it in
    // the canvas did nothing visible until a reload.
    if (nextTree.some((block) => block.id === blockId)) {
      bridge.setRootLayout(
        blockId,
        selectedBlock.align ?? null,
        rootBlockHoverAttr(next) ?? null,
      );
    }
    patch.scheduleStyleOverrideChange(
      blockId,
      selectedBlock.type,
      selectedBlock.props,
      next,
      selectedBlock.children,
      selectedBlock.variant,
    );
  }

  // The variant the SELECTED block wears, not the type's default: "style
  // every Button like this one" means every Button that looks like this
  // one (ADR-0047).
  const selectedVariant = selectedBlock?.variant ?? DEFAULT_VARIANT;

  return {
    handleChangeProp,
    handleChangeVariant,
    handleChangeStyleOverride,
    typeStyle:
      site && selectedDescriptor
        ? (site.themeTokens?.blockStyles[selectedDescriptor.type]?.[
            selectedVariant
          ] ?? { base: {} })
        : undefined,
  };
}
