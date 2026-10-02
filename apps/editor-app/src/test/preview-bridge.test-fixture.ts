import { act, screen, waitFor } from '@testing-library/react';
import {
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
} from '@kometio/shared-types';
import { PUBLIC_SITE_URL } from '../lib/public-site-url';

/**
 * The canvas as a spec sees it. jsdom loads nothing into the iframe, so the
 * page that would live there is played by these: the messages it sends the
 * editor, in the envelope the bridge accepts (use-preview-bridge.ts).
 */

/** The canvas iframe, once its preview token has come back and it has an address. */
export function findCanvasIframe(): Promise<HTMLIFrameElement> {
  return waitFor(() => {
    const frame = screen.getByTitle('Anteprima pagina');
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error('The canvas preview is not an iframe');
    }
    return frame;
  });
}

/** A message as the page in the canvas sends it. */
export function dispatchFromIframe(
  iframe: HTMLIFrameElement,
  type: string,
  payload: unknown,
): void {
  const event = new MessageEvent('message', {
    data: {
      source: PREVIEW_BRIDGE_SOURCE,
      v: PREVIEW_BRIDGE_VERSION,
      type,
      payload,
    },
    origin: PUBLIC_SITE_URL,
  });
  Object.defineProperty(event, 'source', { value: iframe.contentWindow });
  window.dispatchEvent(event);
}

/** The page in the canvas has loaded and listens: until then the editor takes no change (canvas-editor-shell.tsx). */
export function markCanvasReady(iframe: HTMLIFrameElement): void {
  act(() => {
    dispatchFromIframe(iframe, 'preview:ready', {
      blockRects: [],
      scrollHeight: 0,
    });
  });
}

/** A click on a block in the canvas. The toolbar only appears for a block whose rect the bridge knows, so the page reports it first. */
export function selectBlockWithRect(
  iframe: HTMLIFrameElement,
  blockId: string,
  rect: { top: number; left: number; width: number; height: number },
): void {
  act(() => {
    dispatchFromIframe(iframe, 'preview:ready', {
      blockRects: [{ id: blockId, ...rect }],
      scrollHeight: rect.top + rect.height,
    });
  });
  act(() => {
    dispatchFromIframe(iframe, 'preview:click', { blockId });
  });
}
