import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { useTextEdit } from './use-text-edit';

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: 'Titolo' },
  fields: [
    { kind: 'text', key: 'title', label: 'Titolo', inlineEditable: true },
    { kind: 'text', key: 'subtitle', label: 'Sottotitolo' },
    {
      kind: 'richtext',
      key: 'body',
      label: 'Testo',
      inlineEditable: true,
    },
  ],
};

function buildBridge(
  overrides: Partial<Parameters<typeof useTextEdit>[0]['bridge']> = {},
) {
  return {
    lastTextChange: null,
    lastDblClick: null,
    enterTextEdit: vi.fn(),
    exitTextEdit: vi.fn(),
    pageLinkRequest: null,
    applyPageLink: vi.fn(),
    ...overrides,
  };
}

function setup(
  bridge: ReturnType<typeof buildBridge>,
  blocks: Block[] = [],
  pickPage: () => Promise<{ pageGroupId: string } | null> = () =>
    Promise.resolve(null),
) {
  const setLocalBlocks = vi.fn();
  const scheduleTextChange = vi.fn();
  const localBlocksRef = { current: blocks };
  const { rerender } = renderHook(
    (props: { bridge: ReturnType<typeof buildBridge> }) =>
      useTextEdit({
        bridge: props.bridge,
        registry: [heroDescriptor],
        localBlocksRef,
        setLocalBlocks,
        scheduleTextChange,
        pickPage,
        menuLabels: {
          bold: 'B',
          italic: 'I',
          underline: 'U',
          strike: 'S',
          bulletList: '•',
          orderedList: '1.',
          linkToPage: 'P',
          linkToUrl: 'U',
          unlink: 'X',
          urlPrompt: '?',
        },
      }),
    { initialProps: { bridge } },
  );
  return { rerender, setLocalBlocks, scheduleTextChange };
}

describe('useTextEdit', () => {
  it('does nothing when there is no text change or double click', () => {
    const bridge = buildBridge();
    const { setLocalBlocks, scheduleTextChange } = setup(bridge);

    expect(setLocalBlocks).not.toHaveBeenCalled();
    expect(scheduleTextChange).not.toHaveBeenCalled();
  });

  it('applies a new lastTextChange optically and schedules the debounced save', () => {
    const bridge = buildBridge();
    const { rerender, setLocalBlocks, scheduleTextChange } = setup(bridge);

    const nextBridge = buildBridge({
      lastTextChange: { blockId: 'hero-1', field: 'title', text: 'Nuovo' },
    });
    rerender({ bridge: nextBridge });

    expect(setLocalBlocks).toHaveBeenCalledWith(expect.any(Function));
    expect(scheduleTextChange).toHaveBeenCalledWith('hero-1', 'title', 'Nuovo');
  });

  it('does not re-apply the same lastTextChange object twice', () => {
    const sameChange = { blockId: 'hero-1', field: 'title', text: 'Nuovo' };
    const bridge = buildBridge({ lastTextChange: sameChange });
    const { rerender, setLocalBlocks } = setup(bridge);
    setLocalBlocks.mockClear();

    rerender({ bridge: buildBridge({ lastTextChange: sameChange }) });

    expect(setLocalBlocks).not.toHaveBeenCalled();
  });

  it('enters text edit on a double click on an inlineEditable field', () => {
    const bridge = buildBridge();
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    const { rerender } = setup(bridge, blocks);

    const nextBridge = buildBridge({
      lastDblClick: { blockId: 'hero-1', field: 'title' },
    });
    rerender({ bridge: nextBridge });

    // The labels travel with it: the iframe renders a site in the
    // VISITOR's language and cannot translate the editor's own chrome.
    expect(nextBridge.enterTextEdit).toHaveBeenCalledWith(
      'hero-1',
      'title',
      false,
      expect.objectContaining({ bold: 'B' }),
    );
  });

  it('does not enter text edit on a double click on a field that is not inlineEditable', () => {
    const bridge = buildBridge();
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    const { rerender } = setup(bridge, blocks);

    const nextBridge = buildBridge({
      lastDblClick: { blockId: 'hero-1', field: 'subtitle' },
    });
    rerender({ bridge: nextBridge });

    expect(nextBridge.enterTextEdit).not.toHaveBeenCalled();
  });

  it('does not enter text edit when the double click carries no field (missed a real field)', () => {
    const bridge = buildBridge();
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    const { rerender } = setup(bridge, blocks);

    const nextBridge = buildBridge({
      lastDblClick: { blockId: 'hero-1', field: null },
    });
    rerender({ bridge: nextBridge });

    expect(nextBridge.enterTextEdit).not.toHaveBeenCalled();
  });

  it('calls exitTextEdit on Escape', () => {
    const bridge = buildBridge();
    setup(bridge);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(bridge.exitTextEdit).toHaveBeenCalled();
  });

  it('does not call exitTextEdit on an unrelated key', () => {
    const bridge = buildBridge();
    setup(bridge);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(bridge.exitTextEdit).not.toHaveBeenCalled();
  });

  // The iframe sees a DOM node, not a descriptor, so it cannot tell rich
  // text from a plain string. Getting this wrong is not cosmetic: HTML
  // sent back for a plain field is stored as literal `<p>` characters and
  // shown as such on the page.
  it('tells the iframe when the field is rich text', () => {
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    const { rerender } = setup(buildBridge(), blocks);

    const nextBridge = buildBridge({
      lastDblClick: { blockId: 'hero-1', field: 'body' },
    });
    rerender({ bridge: nextBridge });

    expect(nextBridge.enterTextEdit).toHaveBeenCalledWith(
      'hero-1',
      'body',
      true,
      expect.objectContaining({ bold: 'B' }),
    );
  });

  // The canvas bubble menu cannot open the page picker itself: the picker
  // is editor chrome and the menu lives inside the preview iframe. So it
  // asks, and this answers.
  describe('link to a page, asked for from the canvas', () => {
    it('opens the picker and sends back the chosen page', async () => {
      const picked = { pageGroupId: 'group-1', title: 'Installazione' };
      const { rerender } = setup(buildBridge(), [], () =>
        Promise.resolve(picked),
      );

      const nextBridge = buildBridge({ pageLinkRequest: { at: 1 } });
      rerender({ bridge: nextBridge });
      await act(async () => {
        await Promise.resolve();
      });

      expect(nextBridge.applyPageLink).toHaveBeenCalledWith('group-1');
    });

    // The iframe holds its selection open waiting for this. Without a
    // reply the field stays looking live and answers to nothing.
    it('answers even when the picker is dismissed', async () => {
      const { rerender } = setup(buildBridge(), [], () =>
        Promise.resolve(null),
      );

      const nextBridge = buildBridge({ pageLinkRequest: { at: 1 } });
      rerender({ bridge: nextBridge });
      await act(async () => {
        await Promise.resolve();
      });

      expect(nextBridge.applyPageLink).toHaveBeenCalledWith(null);
    });
  });
});
