import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
} from '@kometio/shared-types';
import { usePreviewBridge } from './use-preview-bridge';

const EXPECTED_ORIGIN = 'http://localhost:4321';

function buildIframeRef() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const ref = createRef<HTMLIFrameElement>();
  ref.current = iframe;
  return { ref, contentWindow: iframe.contentWindow };
}

function dispatchBridgeMessage(
  contentWindow: Window | null,
  origin: string,
  data: unknown,
) {
  const event = new MessageEvent('message', { data, origin });
  // `source` is a getter-only property on the constructed event, and this
  // test environment doesn't honor `MessageEventInit.source` either — a
  // real cross-window postMessage sets it natively, so it's forced here to
  // simulate that.
  Object.defineProperty(event, 'source', { value: contentWindow });
  window.dispatchEvent(event);
}

describe('usePreviewBridge', () => {
  it('starts idle before any message arrives', () => {
    const { ref } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    expect(result.current).toEqual({
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
      patchBlock: expect.any(Function),
      insertBlock: expect.any(Function),
      removeBlock: expect.any(Function),
      reorderBlocks: expect.any(Function),
      enterTextEdit: expect.any(Function),
      applyPageLink: expect.any(Function),
      exitTextEdit: expect.any(Function),
      selectBlock: expect.any(Function),
      updateBlockStyleCss: expect.any(Function),
      setRootLayout: expect.any(Function),
      scrollToBlock: expect.any(Function),
      markLoading: expect.any(Function),
    });
  });

  it('becomes ready and stores blockRects on preview:ready', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:ready',
        payload: {
          blockRects: [{ id: 'a', top: 1, left: 2, width: 3, height: 4 }],
          scrollHeight: 900,
        },
      });
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.blockRects).toEqual([
      { id: 'a', top: 1, left: 2, width: 3, height: 4 },
    ]);
  });

  it('is not ready again once a new document starts loading, until that one says so', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));
    const ready = () =>
      act(() => {
        dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'preview:ready',
          payload: {
            blockRects: [{ id: 'a', top: 1, left: 2, width: 3, height: 4 }],
            scrollHeight: 900,
          },
        });
      });
    ready();

    act(() => result.current.markLoading());

    expect(result.current.isReady).toBe(false);
    expect(result.current.blockRects).toEqual([]);
    ready();
    expect(result.current.isReady).toBe(true);
  });

  it('updates blockRects on preview:block-rects without resetting isReady', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));
    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:ready',
        payload: { blockRects: [], scrollHeight: 0 },
      });
    });

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:block-rects',
        payload: {
          blockRects: [{ id: 'b', top: 5, left: 6, width: 7, height: 8 }],
        },
      });
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.blockRects).toEqual([
      { id: 'b', top: 5, left: 6, width: 7, height: 8 },
    ]);
  });

  it('tracks the hovered block id, including clearing it back to null', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'hero-1', pointer: { x: 10, y: 20 } },
      });
    });
    expect(result.current.hoveredBlockId).toBe('hero-1');

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: null, pointer: { x: 0, y: 0 } },
      });
    });
    expect(result.current.hoveredBlockId).toBeNull();
  });

  it('tracks the selected block id on preview:click', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:click',
        payload: { blockId: 'hero-1' },
      });
    });

    expect(result.current.selectedBlockId).toBe('hero-1');
  });

  it('ignores a message from the wrong origin', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, 'http://evil.example', {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'hero-1', pointer: { x: 0, y: 0 } },
      });
    });

    expect(result.current.hoveredBlockId).toBeNull();
  });

  it("accepts a message with origin 'null' from its own iframe (sandboxed without allow-same-origin, so its origin is opaque)", () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, 'null', {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'hero-1', pointer: { x: 0, y: 0 } },
      });
    });

    expect(result.current.hoveredBlockId).toBe('hero-1');
  });

  it("ignores a message with origin 'null' whose source is NOT this iframe's own contentWindow — the identity check is what keeps the opaque-origin acceptance above safe", () => {
    const { ref } = buildIframeRef();
    const someOtherWindow = window;
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(someOtherWindow, 'null', {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'hero-1', pointer: { x: 0, y: 0 } },
      });
    });

    expect(result.current.hoveredBlockId).toBeNull();
  });

  it("ignores a message whose source is not this iframe's own contentWindow", () => {
    const { ref } = buildIframeRef();
    const someOtherWindow = window;
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(someOtherWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'hero-1', pointer: { x: 0, y: 0 } },
      });
    });

    expect(result.current.hoveredBlockId).toBeNull();
  });

  it('ignores a postMessage without the expected envelope (a third-party widget)', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        someUnrelatedPayload: true,
      });
    });

    expect(result.current).toEqual({
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
      patchBlock: expect.any(Function),
      insertBlock: expect.any(Function),
      removeBlock: expect.any(Function),
      reorderBlocks: expect.any(Function),
      enterTextEdit: expect.any(Function),
      applyPageLink: expect.any(Function),
      exitTextEdit: expect.any(Function),
      selectBlock: expect.any(Function),
      updateBlockStyleCss: expect.any(Function),
      setRootLayout: expect.any(Function),
      scrollToBlock: expect.any(Function),
      markLoading: expect.any(Function),
    });
  });

  it('stores the last dblclick as state, as a new object each time', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:dblclick',
        payload: { blockId: 'hero-1', field: 'title', richText: false },
      });
    });
    const first = result.current.lastDblClick;
    expect(first).toEqual({ blockId: 'hero-1', field: 'title' });

    // The same blockId/field as before — a caller's `useEffect` keyed on
    // `lastDblClick` still has to fire again (by reference, not by content
    // equality): every double click is a distinct event.
    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:dblclick',
        payload: { blockId: 'hero-1', field: 'title' },
      });
    });
    expect(result.current.lastDblClick).toEqual({
      blockId: 'hero-1',
      field: 'title',
    });
    expect(result.current.lastDblClick).not.toBe(first);
  });

  it('stores field: null when the dblclick landed outside any inlineEditable field', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:dblclick',
        payload: { blockId: 'hero-1', field: null },
      });
    });

    expect(result.current.lastDblClick).toEqual({
      blockId: 'hero-1',
      field: null,
    });
  });

  it('stores the last text change as state, as a new object each time', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:text-changed',
        payload: { blockId: 'hero-1', field: 'title', text: 'Nuovo titolo' },
      });
    });
    const first = result.current.lastTextChange;
    expect(first).toEqual({
      blockId: 'hero-1',
      field: 'title',
      text: 'Nuovo titolo',
    });

    // The same text as before (the user types and then deletes a character,
    // say) — a caller's `useEffect` keyed on `lastTextChange` still has to
    // fire again, by reference rather than by content.
    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:text-changed',
        payload: { blockId: 'hero-1', field: 'title', text: 'Nuovo titolo' },
      });
    });
    expect(result.current.lastTextChange).toEqual({
      blockId: 'hero-1',
      field: 'title',
      text: 'Nuovo titolo',
    });
    expect(result.current.lastTextChange).not.toBe(first);
  });

  it('enterTextEdit posts editor:enter-text-edit to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.enterTextEdit('hero-1', 'title', false);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:enter-text-edit',
        payload: { blockId: 'hero-1', field: 'title', richText: false },
      },
      '*',
    );
  });

  it('exitTextEdit posts editor:exit-text-edit to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.exitTextEdit();

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:exit-text-edit',
        payload: {},
      },
      '*',
    );
  });

  it('patchBlock posts editor:patch-block to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.patchBlock('hero-1', '<div>new</div>');

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:patch-block',
        payload: { blockId: 'hero-1', html: '<div>new</div>' },
      },
      '*',
    );
  });

  it('updateBlockStyleCss posts editor:update-block-style-css to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.updateBlockStyleCss(
      '.kometio-button { --kometio-override-bg: red; }',
    );

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:update-block-style-css',
        payload: { css: '.kometio-button { --kometio-override-bg: red; }' },
      },
      '*',
    );
  });

  it('insertBlock posts editor:insert-block to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.insertBlock('<div>new</div>', 'container-1', 'sibling-1');

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:insert-block',
        payload: {
          html: '<div>new</div>',
          parentId: 'container-1',
          beforeBlockId: 'sibling-1',
        },
      },
      '*',
    );
  });

  it('removeBlock posts editor:remove-block to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.removeBlock('hero-1');

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:remove-block',
        payload: { blockId: 'hero-1' },
      },
      '*',
    );
  });

  it('selectBlock sets selectedBlockId directly — no postMessage, unlike a real preview:click — so the Layers panel can select a block the canvas has no clickable pixel for (a child fully covering its parent)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      result.current.selectBlock('column-1');
    });

    expect(result.current.selectedBlockId).toBe('column-1');
    expect(postMessageSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.selectBlock(null);
    });

    expect(result.current.selectedBlockId).toBeNull();
  });

  it('scrollToBlock posts editor:scroll-to-block to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.scrollToBlock('hero-1');

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:scroll-to-block',
        payload: { blockId: 'hero-1' },
      },
      '*',
    );
  });

  it('reorderBlocks posts editor:reorder-blocks to the iframe, at "*" (the iframe is sandboxed without allow-same-origin, its origin is opaque)', () => {
    const { ref, contentWindow } = buildIframeRef();
    if (!contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(contentWindow, 'postMessage');
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    result.current.reorderBlocks(null, ['b', 'a']);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:reorder-blocks',
        payload: { parentId: null, orderedIds: ['b', 'a'] },
      },
      '*',
    );
  });

  it('tracks activeDrag on preview:drag-start and updates its pointer on preview:drag-move', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:drag-start',
        payload: { blockId: 'hero-1', pointer: { x: 10, y: 20 } },
      });
    });
    expect(result.current.activeDrag).toEqual({
      blockId: 'hero-1',
      pointer: { x: 10, y: 20 },
    });

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:drag-move',
        payload: { pointer: { x: 15, y: 40 } },
      });
    });
    expect(result.current.activeDrag).toEqual({
      blockId: 'hero-1',
      pointer: { x: 15, y: 40 },
    });
  });

  it('ignores preview:drag-move when no drag is active', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:drag-move',
        payload: { pointer: { x: 15, y: 40 } },
      });
    });

    expect(result.current.activeDrag).toBeNull();
  });

  it('clears activeDrag and reports dragEnded on preview:drag-end', () => {
    const { ref, contentWindow } = buildIframeRef();
    const { result } = renderHook(() => usePreviewBridge(ref, EXPECTED_ORIGIN));

    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:drag-start',
        payload: { blockId: 'hero-1', pointer: { x: 10, y: 20 } },
      });
    });
    act(() => {
      dispatchBridgeMessage(contentWindow, EXPECTED_ORIGIN, {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:drag-end',
        payload: {},
      });
    });

    expect(result.current.activeDrag).toBeNull();
    expect(result.current.dragEnded).toEqual({
      blockId: 'hero-1',
      pointer: { x: 10, y: 20 },
    });
  });
});
