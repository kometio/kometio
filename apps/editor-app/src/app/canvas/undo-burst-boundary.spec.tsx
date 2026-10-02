import { useEffect, useRef, useState } from 'react';
import { render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { updateBlockProps } from './use-block-tree';
import { usePropertyPatch } from './use-property-patch';
import { useTextEdit } from './use-text-edit';

/**
 * The burst boundary is the granularity of undo, and it is assembled from
 * three hooks that canvas-editor-shell.tsx calls in a particular ORDER.
 * Each hook's own spec passes while the assembled behaviour is still
 * wrong, because what decides the answer is when `localBlocksRef` is
 * refreshed relative to when a burst opens — a fact no single hook can
 * see. So this file mounts the real hooks in the real order, and asserts
 * on the tree undo would actually restore.
 */

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: '' },
  fields: [
    { kind: 'text', key: 'title', label: 'Title', inlineEditable: true },
  ],
};

interface Recorded {
  blockId: string;
  before: Block[];
  after: Block[];
}

/** The canvas's wiring, reduced to what decides the burst boundary — the same hooks useCanvasDraft and the shell assemble, in the same declaration order. */
function Harness({
  textChange,
  recorded,
}: {
  textChange: { blockId: string; field: string; text: string } | null;
  recorded: Recorded[];
}) {
  const [localBlocks, setLocalBlocks] = useState<Block[]>([
    { id: 'hero-1', type: 'Hero', props: { title: '' } },
  ]);
  const localBlocksRef = useRef(localBlocks);
  // Stands in for useBlockTreeMutations' own baseline.
  const lastCommittedRef = useRef(localBlocks);

  // Stands in for the ref repoint inside useCanvasDraft.
  useEffect(() => {
    localBlocksRef.current = localBlocks;
  });

  const { scheduleTextChange } = usePropertyPatch({
    pageId: 'page-1',
    token: 'tok',
    patchBlock: vi.fn(),
    onSaveStyleOverride: vi.fn(),
    onSaveVariant: vi.fn(),
    onSaveDraft: (blockId, _changedKey, props) => {
      const next = updateBlockProps(localBlocksRef.current, blockId, props);
      setLocalBlocks(next);
    },
    onBurstEnd: () => {
      const before = lastCommittedRef.current;
      const after = localBlocksRef.current;
      if (before === after) {
        return;
      }
      lastCommittedRef.current = after;
      recorded.push({ blockId: 'hero-1', before, after });
    },
  });

  // Called by the shell after useCanvasDraft, so its effect runs AFTER the one above.
  useTextEdit({
    bridge: {
      lastTextChange: textChange,
      lastDblClick: null,
      enterTextEdit: vi.fn(),
      exitTextEdit: vi.fn(),
      pageLinkRequest: null,
      applyPageLink: vi.fn(),
    },
    registry: [heroDescriptor],
    localBlocksRef,
    setLocalBlocks,
    scheduleTextChange,
    pickPage: () => Promise.resolve(null),
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
  });

  return null;
}

function titleOf(blocks: Block[]): unknown {
  return blocks[0]?.props?.title;
}

describe('undo burst boundary, hooks assembled as the shell assembles them', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('undoes a run of inline typing back to the text before the FIRST keystroke', () => {
    const recorded: Recorded[] = [];
    const { rerender } = render(
      <Harness textChange={null} recorded={recorded} />,
    );

    // Each keystroke arrives from the iframe as a new lastTextChange object.
    for (const text of ['h', 'he', 'hel', 'hell', 'hello']) {
      rerender(
        <Harness
          textChange={{ blockId: 'hero-1', field: 'title', text }}
          recorded={recorded}
        />,
      );
    }
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(recorded).toHaveLength(1);
    expect(titleOf(recorded[0].after)).toBe('hello');
    // The whole point of a burst: undo goes back to before the typing
    // started, not to one character in.
    expect(titleOf(recorded[0].before)).toBe('');
  });
});
