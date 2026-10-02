import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  isPreviewBridgeMessage,
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
  type BlockAlign,
  type BlockRect,
  type RichTextMenuLabels,
  type RootBlockLayout,
} from '@kometio/shared-types';

/**
 * The one place a selection changes, so "what does Cmd+click do" has a
 * single answer rather than one per call site (Fase 7).
 *
 * Additive toggles: clicking an already-selected block with the modifier
 * held REMOVES it, which is what every file manager and every drawing tool
 * does, and what makes a mis-click recoverable without starting over.
 *
 * The primary follows the last block still in the set — so removing the
 * primary hands the toolbar and the Inspector to whatever remains, instead
 * of leaving them pointing at a block nobody has selected.
 */
function withSelection<
  T extends { selectedBlockId: string | null; selectedBlockIds: string[] },
>(prev: T, blockId: string | null, additive: boolean): T {
  if (!blockId) {
    return { ...prev, selectedBlockId: null, selectedBlockIds: [] };
  }
  if (!additive) {
    return { ...prev, selectedBlockId: blockId, selectedBlockIds: [blockId] };
  }
  const ids = prev.selectedBlockIds.includes(blockId)
    ? prev.selectedBlockIds.filter((id) => id !== blockId)
    : [...prev.selectedBlockIds, blockId];
  return {
    ...prev,
    selectedBlockIds: ids,
    selectedBlockId: ids[ids.length - 1] ?? null,
  };
}

export interface PreviewBridgeState {
  /** Empty until `preview:ready` arrives for the first time. */
  blockRects: BlockRect[];
  /**
   * Whether the document now in the iframe has said `preview:ready`.
   * Anything posted before then is lost — the page is not listening yet —
   * so nothing that changes the page may be offered until it is true.
   */
  isReady: boolean;
  hoveredBlockId: string | null;
  /**
   * No longer read-only: besides a real `preview:click` from the iframe,
   * `selectBlock` below also writes it directly — the Layers panel needs
   * that to select a block the canvas covers completely with one of its own
   * children (a Column containing a single full-width Gallery, say: no
   * canvas pixel belongs to the Column itself any more), where clicking on
   * the canvas would always select the child and never the parent.
   */
  selectedBlockId: string | null;
  /**
   * Every block currently selected, in the order they were picked (Fase 7).
   *
   * `selectedBlockId` above is the LAST of these — the "primary" — and
   * stays the one the Inspector edits and the toolbar belongs to. That is
   * the whole shape of the change: multi-select is for the operations that
   * make sense on many blocks at once (delete, duplicate, copy), while
   * editing a property is a thing you do to one block. Keeping the primary
   * as a plain field also means every existing reader of
   * `selectedBlockId` — the overlay, the toolbar, the mutations — kept
   * working untouched.
   *
   * Always contains `selectedBlockId` when that is not null, and is empty
   * when it is.
   */
  selectedBlockIds: string[];
  /**
   * The last double click received (Day 4) — a NEW OBJECT on every message
   * (even when blockId/field are identical to the previous one), so a
   * caller's `useEffect` keyed on this value fires on every single double
   * click by reference, not by content equality. Exposed as state rather
   * than as a callback: deciding whether the field is `inlineEditable`
   * requires the block-registry, which this hook (a generic postMessage
   * bridge) knows nothing about — that policy lives in the caller
   * (canvas-editor-shell.tsx), not here.
   */
  lastDblClick: { blockId: string; field: string | null } | null;
  /**
   * The canvas bubble menu asking the editor to pick a page to link to —
   * the picker lives here, not in the iframe. A new object on every
   * request, for the same reason as `lastDblClick`: asking twice for the
   * same thing has to look different, or the second ask does nothing.
   */
  pageLinkRequest: { at: number } | null;
  /**
   * The last text typed live in a TipTap instance mounted in place (Day 4)
   * — the same reason as `lastDblClick`: a new object on every message, so
   * a caller's `useEffect` fires on every single change even when
   * blockId/field repeat.
   */
  lastTextChange: { blockId: string; field: string; text: string } | null;
  /**
   * Non-null while a simulated drag is in progress (direct canvas
   * reordering, Day 3/4) — `pointer` is iframe-relative (the same semantics
   * as `BlockRect`; the caller combines it with the iframe's offset to draw
   * the drop indicator, as OverlayLayer already does for hover/selection).
   */
  activeDrag: { blockId: string; pointer: { x: number; y: number } } | null;
  /**
   * A new object on every `preview:drag-end` (the same reason as
   * `lastDblClick`) — it carries the last known blockId/pointer of the drag
   * that just ended, so the caller can compute the final drop position and
   * apply it to its own `Block[]`. `activeDrag` returns to `null` in the
   * same state update (the drag is visually over).
   */
  dragEnded: { blockId: string; pointer: { x: number; y: number } } | null;
  /** Replaces an already-rendered block with the fragment HTML from render-block-fragment (day 3) — see block-fragment-api-client.ts. */
  patchBlock: (blockId: string, html: string) => void;
  /** Inserts a block NEVER rendered before (insert/duplicate) — see EditorInsertBlockMessage. */
  insertBlock: (
    html: string,
    parentId: string | null,
    beforeBlockId: string | null,
    rootLayout?: RootBlockLayout,
  ) => void;
  /** Removes an already-rendered block from the iframe's DOM — see EditorRemoveBlockMessage. */
  removeBlock: (blockId: string) => void;
  /** Reorders the existing siblings (all already rendered) — see EditorReorderBlocksMessage. */
  reorderBlocks: (parentId: string | null, orderedIds: string[]) => void;
  /** Monta TipTap sul posto nell'iframe (Giorno 4) — vedi editor:enter-text-edit. */
  enterTextEdit: (
    blockId: string,
    field: string,
    richText: boolean,
    labels?: RichTextMenuLabels,
  ) => void;
  /** Answers `preview:request-page-link` — the page the picker returned, or null if it was dismissed. */
  applyPageLink: (pageGroupId: string | null) => void;
  /** Smonta l'istanza TipTap corrente nell'iframe, se c'è. */
  exitTextEdit: () => void;
  /** Selects a block directly from this side (the Layers panel), without going through a real `preview:click` on the canvas — see the comment on `selectedBlockId` above. */
  selectBlock: (blockId: string | null, additive?: boolean) => void;
  /** Updates the `<style>` holding the "component-level" overrides in the iframe (docs/adr/0022, the "Style" button) — `css` is already prepared (buildBlockStyleOverridesCss), and the iframe only writes it. */
  updateBlockStyleCss: (css: string) => void;
  /** ADR-0049 — how much page width a ROOT block claims. `null` = the default content column. */
  /**
   * The wrapper a ROOT block lives in: how much width it claims (ADR-0049)
   * and its hover effect. Both are attributes on that wrapper rather than
   * on the block, so re-rendering the block's own HTML would not carry
   * them — see EditorSetRootLayoutMessage.
   */
  setRootLayout: (
    blockId: string,
    align: BlockAlign | null,
    hover: string | null,
  ) => void;
  /** Brings block `blockId` into view in the iframe's document (the Layers panel) — see EditorScrollToBlockMessage. */
  scrollToBlock: (blockId: string) => void;
  /**
   * A new document is on its way into the iframe (a first load, a page
   * change, a remount after a restore): not ready again until it says so,
   * and the old document's block positions no longer apply.
   */
  markLoading: () => void;
}

type PreviewBridgeMessageState = Omit<
  PreviewBridgeState,
  | 'patchBlock'
  | 'insertBlock'
  | 'removeBlock'
  | 'reorderBlocks'
  | 'enterTextEdit'
  | 'applyPageLink'
  | 'exitTextEdit'
  | 'selectBlock'
  | 'updateBlockStyleCss'
  | 'setRootLayout'
  | 'scrollToBlock'
  | 'markLoading'
>;

const initialState: PreviewBridgeMessageState = {
  blockRects: [],
  isReady: false,
  hoveredBlockId: null,
  selectedBlockId: null,
  selectedBlockIds: [],
  lastDblClick: null,
  pageLinkRequest: null,
  lastTextChange: null,
  activeDrag: null,
  dragEnded: null,
};

/**
 * The parent side of the postMessage protocol (see
 * @kometio/shared-types/preview-bridge-protocol.ts and the visual editor
 * plan, Day 2) — it listens for `preview:*` from one specific iframe, never
 * from just any iframe: both `event.origin` and `event.source` are checked,
 * so another iframe or extension sending the same envelope would never be
 * considered.
 *
 * Every incoming event is exposed as STATE (never as a callback prop): a
 * callback passed by the caller would have a fresh identity on each of its
 * renders, and making it depend on other values derived from the caller's
 * own hooks (`usePropertyPatch`, say, which in turn needs `patchBlock`
 * returned by THIS hook) would create a cycle between two hook calls —
 * nothing of the sort happens with state: the caller reacts with its own
 * `useEffect` keyed on the value, read when it needs it.
 */
export function usePreviewBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  expectedOrigin: string,
): PreviewBridgeState {
  const [state, setState] = useState<PreviewBridgeMessageState>(initialState);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      // The iframe is sandboxed without `allow-same-origin` (it holds
      // blocks inserted by platform users, which are not trusted) — its
      // origin is therefore opaque, and every message leaving it arrives
      // with `event.origin === 'null'`, never public-site's real origin.
      // The check's security still holds through the identity comparison
      // below (`event.source`), which pins down that exact iframe
      // regardless of the origin string.
      if (event.origin !== expectedOrigin && event.origin !== 'null') {
        return;
      }
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (!isPreviewBridgeMessage(event.data)) {
        return;
      }

      const message = event.data;
      switch (message.type) {
        case 'preview:ready':
          setState((prev) => ({
            ...prev,
            isReady: true,
            blockRects: message.payload.blockRects,
          }));
          return;
        case 'preview:block-rects':
          setState((prev) => ({
            ...prev,
            blockRects: message.payload.blockRects,
          }));
          return;
        case 'preview:hover':
          setState((prev) => ({
            ...prev,
            hoveredBlockId: message.payload.blockId,
          }));
          return;
        case 'preview:click':
          setState((prev) =>
            withSelection(
              prev,
              message.payload.blockId,
              message.payload.additive ?? false,
            ),
          );
          return;
        case 'preview:dblclick':
          setState((prev) => ({
            ...prev,
            lastDblClick: {
              blockId: message.payload.blockId,
              field: message.payload.field,
            },
          }));
          return;
        case 'preview:request-page-link':
          setState((prev) => ({
            ...prev,
            pageLinkRequest: { at: Date.now() },
          }));
          return;
        case 'preview:text-changed':
          setState((prev) => ({
            ...prev,
            lastTextChange: {
              blockId: message.payload.blockId,
              field: message.payload.field,
              text: message.payload.text,
            },
          }));
          return;
        case 'preview:drag-start':
          setState((prev) => ({
            ...prev,
            activeDrag: {
              blockId: message.payload.blockId,
              pointer: message.payload.pointer,
            },
          }));
          return;
        case 'preview:drag-move':
          setState((prev) =>
            prev.activeDrag
              ? {
                  ...prev,
                  activeDrag: {
                    ...prev.activeDrag,
                    pointer: message.payload.pointer,
                  },
                }
              : prev,
          );
          return;
        case 'preview:drag-end':
          setState((prev) => ({
            ...prev,
            activeDrag: null,
            dragEnded: prev.activeDrag,
          }));
          return;
        case 'editor:patch-block':
        case 'editor:enter-text-edit':
        case 'editor:exit-text-edit':
        case 'editor:insert-block':
        case 'editor:remove-block':
        case 'editor:reorder-blocks':
        case 'editor:update-block-style-css':
        case 'editor:scroll-to-block':
        case 'editor:set-root-layout':
        case 'editor:apply-page-link':
          // Parent -> iframe: never expected arriving here, since the
          // parent is what sends them (see patchBlock/enterTextEdit/
          // exitTextEdit below). Ignored defensively.
          return;
        default: {
          // Compile-time only: a message type added to the protocol and not
          // decided on above stops compiling. At runtime a peer newer than
          // this build can send one, and ignoring it is the right answer.
          const undecided: never = message;
          return undecided;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, expectedOrigin]);

  const patchBlock = useCallback(
    (blockId: string, html: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:patch-block',
          payload: { blockId, html },
        },
        // Not `expectedOrigin`: the iframe is sandboxed without
        // `allow-same-origin` (see handleMessage above), so its origin is
        // opaque and can never match a literal string — `'*'` has to be
        // used. No security is lost: the write goes to the direct
        // `iframeRef.current.contentWindow` reference, never to a window
        // that was "found".
        '*',
      );
    },
    [iframeRef],
  );

  const insertBlock = useCallback(
    (
      html: string,
      parentId: string | null,
      beforeBlockId: string | null,
      rootLayout?: RootBlockLayout,
    ) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:insert-block',
          payload: { html, parentId, beforeBlockId, rootLayout },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:remove-block',
          payload: { blockId },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const reorderBlocks = useCallback(
    (parentId: string | null, orderedIds: string[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:reorder-blocks',
          payload: { parentId, orderedIds },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const applyPageLink = useCallback(
    (pageGroupId: string | null) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:apply-page-link',
          payload: { pageGroupId },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const enterTextEdit = useCallback(
    (
      blockId: string,
      field: string,
      richText: boolean,
      labels?: RichTextMenuLabels,
    ) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:enter-text-edit',
          payload: { blockId, field, richText, labels },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const exitTextEdit = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:exit-text-edit',
        payload: {},
      },
      '*',
    );
  }, [iframeRef]);

  const selectBlock = useCallback(
    (blockId: string | null, additive = false) => {
      setState((prev) => withSelection(prev, blockId, additive));
    },
    [],
  );

  const updateBlockStyleCss = useCallback(
    (css: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:update-block-style-css',
          payload: { css },
        },
        '*',
      );
    },
    [iframeRef],
  );

  /**
   * ADR-0049 — the attribute lives on the `.kometio-root-block` wrapper, not
   * on the block, so a `patchBlock` re-render would not carry it. Sending
   * it on its own also means an alignment change costs no render round
   * trip at all.
   */
  const setRootLayout = useCallback(
    (blockId: string, align: BlockAlign | null, hover: string | null) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:set-root-layout',
          payload: { blockId, align, hover },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const scrollToBlock = useCallback(
    (blockId: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:scroll-to-block',
          payload: { blockId },
        },
        '*',
      );
    },
    [iframeRef],
  );

  const markLoading = useCallback(() => {
    setState((prev) =>
      prev.isReady ? { ...prev, isReady: false, blockRects: [] } : prev,
    );
  }, []);

  return {
    ...state,
    markLoading,
    patchBlock,
    insertBlock,
    removeBlock,
    reorderBlocks,
    enterTextEdit,
    applyPageLink,
    exitTextEdit,
    selectBlock,
    updateBlockStyleCss,
    setRootLayout,
    scrollToBlock,
  };
}
