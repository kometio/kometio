import { describe, expect, it } from 'vitest';
import {
  isPreviewBridgeMessage,
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
} from './preview-bridge-protocol';

describe('isPreviewBridgeMessage', () => {
  it('accepts a well-formed envelope', () => {
    expect(
      isPreviewBridgeMessage({
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: { blockId: 'block-1', pointer: { x: 0, y: 0 } },
      }),
    ).toBe(true);
  });

  it('rejects a message with the wrong source', () => {
    expect(
      isPreviewBridgeMessage({
        source: 'some-other-widget',
        v: PREVIEW_BRIDGE_VERSION,
        type: 'preview:hover',
        payload: {},
      }),
    ).toBe(false);
  });

  it('rejects a message with the wrong version', () => {
    expect(
      isPreviewBridgeMessage({
        source: PREVIEW_BRIDGE_SOURCE,
        v: 2,
        type: 'preview:hover',
        payload: {},
      }),
    ).toBe(false);
  });

  it('rejects non-object data (a third-party postMessage)', () => {
    expect(isPreviewBridgeMessage('just a string')).toBe(false);
    expect(isPreviewBridgeMessage(null)).toBe(false);
    expect(isPreviewBridgeMessage(undefined)).toBe(false);
    expect(isPreviewBridgeMessage(42)).toBe(false);
  });

  it('accepts an editor:scroll-to-block envelope', () => {
    expect(
      isPreviewBridgeMessage({
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:scroll-to-block',
        payload: { blockId: 'block-1' },
      }),
    ).toBe(true);
  });

  it('rejects an object missing a type', () => {
    expect(
      isPreviewBridgeMessage({
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
      }),
    ).toBe(false);
  });
});
