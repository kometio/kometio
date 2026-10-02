import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import * as blockFragmentApi from '../../lib/block-fragment-api-client';
import { useBlockTreeMutations } from './use-block-tree-mutations';

vi.mock('../../lib/block-fragment-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/block-fragment-api-client')
    >();
  return { ...actual, renderBlockFragment: vi.fn() };
});

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: 'Titolo' },
  fields: [],
};

interface HookProps {
  localBlocks: Block[];
  selectedBlock: Block | null;
  pageId?: string;
  /** Ready unless a test says otherwise. */
  canvasReady?: boolean;
}

function setup(localBlocks: Block[]) {
  const initialProps: HookProps = {
    localBlocks,
    selectedBlock: null,
    pageId: 'page-1',
  };
  const onChange = vi.fn();
  const setLocalBlocks = vi.fn();
  const bridge = {
    selectedBlockId: null,
    selectedBlockIds: [],
    patchBlock: vi.fn(),
    insertBlock: vi.fn(),
    removeBlock: vi.fn(),
    reorderBlocks: vi.fn(),
    setRootLayout: vi.fn(),
  };
  const { result, rerender } = renderHook(
    (props: HookProps) =>
      useBlockTreeMutations({
        localBlocks: props.localBlocks,
        setLocalBlocks,
        onChange,
        registry: [heroDescriptor],
        bridge,
        token: 'tok',
        pageId: props.pageId ?? 'page-1',
        selectedBlock: props.selectedBlock,
        selectedDescriptor: props.selectedBlock ? heroDescriptor : undefined,
        canvasReady: props.canvasReady ?? true,
      }),
    {
      initialProps,
    },
  );
  return { result, rerender, onChange, setLocalBlocks, bridge };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useBlockTreeMutations undo/redo', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with nothing to undo or redo', () => {
    const { result } = setup([]);

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo after a root insert removes the block from the canvas and restores the local tree', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>hero</div>',
    );
    const { result, onChange, bridge } = setup([]);

    act(() => {
      result.current.handleInsert(heroDescriptor);
    });
    await flush();
    expect(result.current.canUndo).toBe(true);
    onChange.mockClear();

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith([]);
    expect(bridge.removeBlock).toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  /*
   * A change sent while the canvas loads its page is lost on the way: saved,
   * but not drawn until a reload. The clipboard outlives a change of page,
   * so a paste right after switching language is the realistic case.
   */
  it('takes no change while the canvas loads its page, and offers no undo meanwhile', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>hero</div>',
    );
    const { result, rerender, onChange, bridge } = setup([]);
    act(() => {
      result.current.handleInsert(heroDescriptor);
    });
    await flush();
    onChange.mockClear();
    bridge.insertBlock.mockClear();

    rerender({ localBlocks: [], selectedBlock: null, canvasReady: false });

    expect(result.current.canUndo).toBe(false);
    act(() => {
      result.current.undo();
      result.current.handlePasteMany([
        { type: 'Hero', props: { title: 'Copia' } },
      ]);
      result.current.handleInsert(heroDescriptor);
    });
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(bridge.insertBlock).not.toHaveBeenCalled();
    expect(bridge.removeBlock).not.toHaveBeenCalled();

    rerender({ localBlocks: [], selectedBlock: null, canvasReady: true });

    expect(result.current.canUndo).toBe(true);
  });

  it('redo after undoing an insert re-inserts the exact same block into the canvas', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>hero</div>',
    );
    const { result, bridge } = setup([]);

    act(() => {
      result.current.handleInsert(heroDescriptor);
    });
    await flush();
    act(() => {
      result.current.undo();
    });
    bridge.insertBlock.mockClear();

    act(() => {
      result.current.redo();
    });
    await flush();

    expect(bridge.insertBlock).toHaveBeenCalledWith(
      '<div>hero</div>',
      null,
      null,
      {},
    );
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo after removing a root block re-inserts it at its original position', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>hero</div>',
    );
    const heroBlock: Block = { id: 'hero-1', type: 'Hero', props: {} };
    const textBlock: Block = { id: 'text-1', type: 'Text', props: {} };
    const { result, rerender, onChange, bridge } = setup([
      heroBlock,
      textBlock,
    ]);
    rerender({
      localBlocks: [heroBlock, textBlock],
      selectedBlock: heroBlock,
      pageId: 'page-1',
    });

    act(() => {
      result.current.handleRemoveSelected();
    });
    expect(onChange).toHaveBeenCalledWith([textBlock]);
    onChange.mockClear();

    act(() => {
      result.current.undo();
    });
    await flush();

    expect(onChange).toHaveBeenCalledWith([heroBlock, textBlock]);
    // Reinserted before text-1 — its original next sibling.
    expect(bridge.insertBlock).toHaveBeenCalledWith(
      '<div>hero</div>',
      null,
      'text-1',
      {},
    );
  });

  it('undo after moving a block back restores its original index and canvas order', () => {
    const heroBlock: Block = { id: 'hero-1', type: 'Hero', props: {} };
    const textBlock: Block = { id: 'text-1', type: 'Text', props: {} };
    const { result, rerender, onChange, bridge } = setup([
      heroBlock,
      textBlock,
    ]);
    rerender({
      localBlocks: [heroBlock, textBlock],
      selectedBlock: heroBlock,
      pageId: 'page-1',
    });

    act(() => {
      result.current.handleMoveSelected(1);
    });
    expect(bridge.reorderBlocks).toHaveBeenCalledWith(null, [
      'text-1',
      'hero-1',
    ]);
    bridge.reorderBlocks.mockClear();
    onChange.mockClear();

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith([heroBlock, textBlock]);
    expect(bridge.reorderBlocks).toHaveBeenCalledWith(null, [
      'hero-1',
      'text-1',
    ]);
  });

  it('a new action after an undo clears the redo stack', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>hero</div>',
    );
    const { result } = setup([]);

    act(() => {
      result.current.handleInsert(heroDescriptor);
    });
    await flush();
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.handleInsert(heroDescriptor);
    });
    await flush();

    expect(result.current.canRedo).toBe(false);
  });

  it('handleReorder(null, ...) reorders root blocks and syncs the canvas', () => {
    const heroBlock: Block = { id: 'hero-1', type: 'Hero', props: {} };
    const textBlock: Block = { id: 'text-1', type: 'Text', props: {} };
    const { result, onChange, bridge } = setup([heroBlock, textBlock]);

    act(() => {
      result.current.handleReorder(null, ['text-1', 'hero-1']);
    });

    expect(onChange).toHaveBeenCalledWith([textBlock, heroBlock]);
    expect(bridge.reorderBlocks).toHaveBeenCalledWith(null, [
      'text-1',
      'hero-1',
    ]);
  });

  it('handleReorder(containerId, ...) reorders nested children only, leaving root order untouched', () => {
    const childA: Block = { id: 'child-a', type: 'Text', props: {} };
    const childB: Block = { id: 'child-b', type: 'Text', props: {} };
    const container: Block = {
      id: 'container-1',
      type: 'Container',
      props: {},
      children: [childA, childB],
    };
    const sibling: Block = { id: 'sibling-1', type: 'Hero', props: {} };
    const { result, onChange, bridge } = setup([container, sibling]);

    act(() => {
      result.current.handleReorder('container-1', ['child-b', 'child-a']);
    });

    expect(onChange).toHaveBeenCalledWith([
      { ...container, children: [childB, childA] },
      sibling,
    ]);
    expect(bridge.reorderBlocks).toHaveBeenCalledWith('container-1', [
      'child-b',
      'child-a',
    ]);
  });

  it('undo after a nested reorder restores the original child order and canvas sync', () => {
    const childA: Block = { id: 'child-a', type: 'Text', props: {} };
    const childB: Block = { id: 'child-b', type: 'Text', props: {} };
    const container: Block = {
      id: 'container-1',
      type: 'Container',
      props: {},
      children: [childA, childB],
    };
    const { result, onChange, bridge } = setup([container]);

    act(() => {
      result.current.handleReorder('container-1', ['child-b', 'child-a']);
    });
    bridge.reorderBlocks.mockClear();
    onChange.mockClear();

    act(() => {
      result.current.undo();
    });

    expect(onChange).toHaveBeenCalledWith([container]);
    expect(bridge.reorderBlocks).toHaveBeenCalledWith('container-1', [
      'child-a',
      'child-b',
    ]);
  });

  // recordEdit exists for the changes this hook does NOT own: a typed
  // character, an Inspector field, a colour in the style popover. The tree
  // is mutated by canvas-editor-shell, which then hands both sides here.
  it('undo after a property edit restores the tree and re-patches the canvas with the old props', async () => {
    const before: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'old' } },
    ];
    const after: Block[] = [{ id: 'a', type: 'Hero', props: { title: 'new' } }];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<section>old</section>',
    );
    // Mounted on `before`: that IS the baseline the history starts from,
    // which is the whole point — the caller no longer supplies it.
    const { result, setLocalBlocks, onChange, bridge } = setup(before);

    act(() => result.current.recordEdit('a', after));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    await flush();

    expect(setLocalBlocks).toHaveBeenCalledWith(before);
    expect(onChange).toHaveBeenCalledWith(before);
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'a', props: { title: 'old' } }),
    );
    expect(bridge.patchBlock).toHaveBeenCalledWith(
      'a',
      '<section>old</section>',
    );
  });

  it('redo after undoing a property edit patches the canvas back to the new props', async () => {
    const before: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'old' } },
    ];
    const after: Block[] = [{ id: 'a', type: 'Hero', props: { title: 'new' } }];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<i></i>',
    );
    const { result, onChange } = setup(before);

    act(() => result.current.recordEdit('a', after));
    act(() => result.current.undo());
    await flush();
    vi.mocked(blockFragmentApi.renderBlockFragment).mockClear();

    act(() => result.current.redo());
    await flush();

    expect(onChange).toHaveBeenLastCalledWith(after);
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'a', props: { title: 'new' } }),
    );
  });

  // The per-instance style override travels on the block, so it rides the
  // same entry as a property change rather than needing one of its own.
  it('carries a per-instance style override through undo', async () => {
    const before: Block[] = [{ id: 'a', type: 'Hero', props: {} }];
    const after: Block[] = [
      {
        id: 'a',
        type: 'Hero',
        props: {},
        styleOverride: { base: { textColor: '#f00' } },
      },
    ];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<i></i>',
    );
    const { result } = setup(before);

    act(() => result.current.recordEdit('a', after));
    act(() => result.current.undo());
    await flush();

    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'a', styleOverride: undefined }),
    );
  });

  // The shell does NOT remount when you switch language: it resyncs
  // localBlocks from props and keeps every other piece of state. So the
  // history has to notice the page changed under it, or undo reaches back
  // into the previous translation — and since undo also calls onChange,
  // that tree gets SAVED over the current one.
  it('drops the history when the page changes, instead of undoing into the other page', async () => {
    const italian: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Ciao' } },
    ];
    const edited: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Ciao a tutti' } },
    ];
    const english: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Hello' } },
    ];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<i></i>',
    );
    const { result, rerender, onChange } = setup(italian);

    act(() => result.current.recordEdit('a', edited));
    expect(result.current.canUndo).toBe(true);

    // Switching language: a different pageId, and the shell has already
    // swapped localBlocks for the other translation's tree.
    rerender({ localBlocks: english, selectedBlock: null, pageId: 'page-2' });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    await flush();
    expect(onChange).not.toHaveBeenCalledWith(italian);
  });

  // Same reset, seen from the other side: after the switch the history
  // starts again from the NEW page's tree, so the first edit there is
  // undoable back to it and not to something belonging to the old page.
  it('re-baselines on the new page, so the first edit there undoes correctly', async () => {
    const italian: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Ciao' } },
    ];
    const english: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Hello' } },
    ];
    const englishEdited: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'Hello world' } },
    ];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<i></i>',
    );
    const { result, rerender, onChange } = setup(italian);

    rerender({ localBlocks: english, selectedBlock: null, pageId: 'page-2' });
    act(() => result.current.recordEdit('a', englishEdited));
    act(() => result.current.undo());
    await flush();

    expect(onChange).toHaveBeenLastCalledWith(english);
  });

  // An edit is one entry however many keystrokes produced it, so undoing a
  // structural change after typing must not be swallowed by the text.
  it('interleaves edits and structural mutations in one history', async () => {
    const before: Block[] = [
      { id: 'a', type: 'Hero', props: { title: 'old' } },
    ];
    const after: Block[] = [{ id: 'a', type: 'Hero', props: { title: 'new' } }];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<i></i>',
    );
    const { result, rerender, onChange } = setup(before);

    act(() => result.current.recordEdit('a', after));
    rerender({ localBlocks: after, selectedBlock: after[0], pageId: 'page-1' });
    act(() => result.current.handleRemoveSelected());
    await flush();

    act(() => result.current.undo());
    await flush();
    expect(onChange).toHaveBeenLastCalledWith(after);

    act(() => result.current.undo());
    await flush();
    expect(onChange).toHaveBeenLastCalledWith(before);
  });

  it('undo does nothing when there is no history', () => {
    const { result, onChange } = setup([]);

    act(() => {
      result.current.undo();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('redo does nothing when there is nothing to redo', () => {
    const { result, onChange } = setup([]);

    act(() => {
      result.current.redo();
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});

/*
 * A container declares what it may hold: Testimonials takes Testimonial and
 * nothing else. The Layers panel already refused to nest anything else
 * there; inserting from the picker, dropping a template and pasting did
 * not, and a Heading picked with Testimonials selected ended up inside it
 * — saved, and rendered by a block that has no idea what a Heading is.
 */
describe('useBlockTreeMutations respects what a container may hold', () => {
  const descriptors: BlockDescriptor[] = [
    {
      type: 'Heading',
      label: 'Heading',
      category: 'content',
      defaultProps: { text: '', level: 'h2' },
      fields: [],
    },
    {
      type: 'Testimonial',
      label: 'Testimonial',
      category: 'socialProof',
      defaultProps: { quote: '' },
      fields: [],
    },
    {
      type: 'Testimonials',
      label: 'Testimonials',
      category: 'socialProof',
      defaultProps: {},
      fields: [],
      isContainer: true,
      allowedChildTypes: ['Testimonial'],
    },
    {
      type: 'Column',
      label: 'Column',
      category: 'layout',
      defaultProps: {},
      fields: [],
      isContainer: true,
    },
  ];
  const [heading, testimonial] = descriptors;

  const tree: Block[] = [
    {
      id: 'col',
      type: 'Column',
      props: {},
      children: [
        {
          id: 'testi',
          type: 'Testimonials',
          props: {},
          children: [{ id: 't1', type: 'Testimonial', props: { quote: 'Q' } }],
        },
      ],
    },
    { id: 'after', type: 'Heading', props: { text: 'After', level: 'h2' } },
  ];

  function setupWith(selectedId: string | null) {
    const onChange = vi.fn<(blocks: Block[]) => void>();
    const selectedBlock = selectedId ? findInTree(tree, selectedId) : null;
    const { result } = renderHook(() =>
      useBlockTreeMutations({
        localBlocks: tree,
        setLocalBlocks: vi.fn(),
        onChange,
        registry: descriptors,
        bridge: {
          selectedBlockId: selectedId,
          patchBlock: vi.fn(),
          insertBlock: vi.fn(),
          removeBlock: vi.fn(),
          reorderBlocks: vi.fn(),
          setRootLayout: vi.fn(),
        },
        token: 'tok',
        pageId: 'page-1',
        selectedBlock,
        selectedDescriptor: selectedBlock
          ? descriptors.find((d) => d.type === selectedBlock.type)
          : undefined,
        canvasReady: true,
      }),
    );
    return { result, onChange };
  }

  function findInTree(blocks: Block[], id: string): Block | null {
    for (const block of blocks) {
      if (block.id === id) return block;
      const found = block.children ? findInTree(block.children, id) : null;
      if (found) return found;
    }
    return null;
  }

  /** Where each block ended up: its parent's id, or `root`. */
  function parents(blocks: Block[], parent = 'root'): Record<string, string> {
    return blocks.reduce<Record<string, string>>((acc, block) => {
      acc[`${block.type}:${block.id}`] = parent;
      return block.children
        ? { ...acc, ...parents(block.children, block.id) }
        : acc;
    }, {});
  }

  function lastTree(
    onChange: ReturnType<typeof vi.fn<(b: Block[]) => void>>,
  ): Block[] {
    return onChange.mock.calls.at(-1)?.[0] ?? [];
  }

  it('puts a block the selected container may not hold right after the container, in its parent', () => {
    const { result, onChange } = setupWith('testi');

    act(() => result.current.handleInsert(heading));

    const next = lastTree(onChange);
    const column = next.find((b) => b.id === 'col');
    expect(column?.children?.map((b) => b.type)).toEqual([
      'Testimonials',
      'Heading',
    ]);
    expect(findInTree(next, 'testi')?.children?.map((b) => b.type)).toEqual([
      'Testimonial',
    ]);
  });

  it('still nests a block the selected container does accept', () => {
    const { result, onChange } = setupWith('testi');

    act(() => result.current.handleInsert(testimonial));

    expect(
      findInTree(lastTree(onChange), 'testi')?.children?.map((b) => b.type),
    ).toEqual(['Testimonial', 'Testimonial']);
  });

  it('keeps a generic container taking anything', () => {
    const { result, onChange } = setupWith('col');

    act(() => result.current.handleInsert(heading));

    expect(
      findInTree(lastTree(onChange), 'col')?.children?.map((b) => b.type),
    ).toEqual(['Testimonials', 'Heading']);
  });

  it('does the same for a template strip', () => {
    const { result, onChange } = setupWith('testi');

    act(() =>
      result.current.handleInsertBlocks([
        { id: 'tpl-1', type: 'Heading', props: {} },
        { id: 'tpl-2', type: 'Testimonial', props: {} },
      ]),
    );

    const placed = parents(lastTree(onChange));
    // The strip travels together, so it goes where EVERY block in it may
    // sit: a Testimonial could have stayed, the Heading could not.
    expect(placed['Heading:tpl-1']).toBe('col');
    expect(placed['Testimonial:tpl-2']).toBe('col');
  });

  /*
   * A template of several blocks used to land as its LAST block alone: each
   * insert started from the render's own copy of the tree, which never had
   * the blocks inserted just before it.
   */
  it('inserts every block of a template, as one step', () => {
    const { result, onChange } = setupWith(null);

    act(() =>
      result.current.handleInsertBlocks([
        { id: 'a', type: 'Heading', props: {} },
        { id: 'b', type: 'Heading', props: {} },
        { id: 'c', type: 'Heading', props: {} },
      ]),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      lastTree(onChange)
        .map((b) => b.id)
        .slice(-3),
    ).toEqual(['a', 'b', 'c']);
    expect(result.current.canUndo).toBe(true);
  });

  it('pastes beside the selected block only where the pasted type may sit', () => {
    const { result, onChange } = setupWith('t1');

    act(() =>
      result.current.handlePasteMany([
        { id: 'copied', type: 'Heading', props: { text: 'x', level: 'h2' } },
      ]),
    );

    const next = lastTree(onChange);
    expect(findInTree(next, 'testi')?.children?.map((b) => b.type)).toEqual([
      'Testimonial',
    ]);
    expect(findInTree(next, 'col')?.children?.map((b) => b.type)).toEqual([
      'Testimonials',
      'Heading',
    ]);
  });

  it('keeps pasting a block of the same kind right beside it', () => {
    const { result, onChange } = setupWith('t1');

    act(() =>
      result.current.handlePasteMany([
        { id: 'copied', type: 'Testimonial', props: { quote: 'y' } },
      ]),
    );

    expect(
      findInTree(lastTree(onChange), 'testi')?.children?.map((b) => b.type),
    ).toEqual(['Testimonial', 'Testimonial']);
  });

  it('does the same when pasting several blocks at once', () => {
    const { result, onChange } = setupWith('t1');

    act(() =>
      result.current.handlePasteMany([
        { id: 'c1', type: 'Heading', props: { text: 'x', level: 'h2' } },
        { id: 'c2', type: 'Heading', props: { text: 'y', level: 'h2' } },
      ]),
    );

    const next = lastTree(onChange);
    expect(findInTree(next, 'testi')?.children?.map((b) => b.type)).toEqual([
      'Testimonial',
    ]);
    expect(findInTree(next, 'col')?.children?.map((b) => b.type)).toEqual([
      'Testimonials',
      'Heading',
      'Heading',
    ]);
  });
});

/*
 * What reaches the live canvas when blocks are added, without reloading
 * the iframe: a reload jumps the page back to the top, and can show a draft
 * from before the insert if a save was still on its way.
 */
describe('useBlockTreeMutations keeps the canvas in step without reloading', () => {
  const heading: BlockDescriptor = {
    type: 'Heading',
    label: 'Heading',
    category: 'content',
    defaultProps: { text: '', level: 'h2' },
    fields: [],
  };

  const box: BlockDescriptor = {
    type: 'Container',
    label: 'Container',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
  };

  function setupCanvas(
    localBlocks: Block[],
    selected: Block | null = null,
    options: { strict?: boolean } = {},
  ) {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>fragment</div>',
    );
    const onChange = vi.fn<(blocks: Block[]) => void>();
    const reloadCanvas = vi.fn();
    const whenSaved = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const refreshStyleSheet = vi.fn<(blocks: Block[]) => void>();
    const bridge = {
      selectedBlockId: selected?.id ?? null,
      patchBlock: vi.fn(),
      insertBlock: vi.fn(),
      removeBlock: vi.fn(),
      reorderBlocks: vi.fn(),
      setRootLayout: vi.fn(),
    };
    const { result } = renderHook(
      () =>
        useBlockTreeMutations({
          localBlocks,
          setLocalBlocks: vi.fn(),
          onChange,
          registry: [heading, box],
          bridge,
          token: 'tok',
          pageId: 'page-1',
          reloadCanvas,
          whenSaved,
          refreshStyleSheet,
          selectedBlock: selected,
          selectedDescriptor: selected ? heading : undefined,
          canvasReady: true,
        }),
      options.strict ? { wrapper: StrictMode } : undefined,
    );
    return {
      result,
      onChange,
      reloadCanvas,
      whenSaved,
      refreshStyleSheet,
      bridge,
    };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** Every fragment render waits until `release` is called — to act while blocks are still on their way. */
  function holdFragments() {
    const waiting: (() => void)[] = [];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockImplementation(
      (input) =>
        new Promise((resolve) => {
          waiting.push(() => resolve(`<div>${input.blockId}</div>`));
        }),
    );
    return async ({ newestFirst = false } = {}) => {
      const released = waiting.splice(0);
      for (const release of newestFirst ? released.reverse() : released) {
        release();
        await flush();
      }
      await flush();
    };
  }

  const strip: (Block & { id: string })[] = [
    { id: 'a', type: 'Heading', props: {} },
    { id: 'b', type: 'Heading', props: {} },
  ];

  /*
   * The fragment is the block alone; the wrapper a root block sits in is
   * built in the iframe, and reads the block's width and hover effect. A
   * duplicate of a full-width block used to land at content width.
   */
  it("sends a root block's width and style along with its fragment, for its wrapper", async () => {
    const wide: Block = {
      id: 'wide',
      type: 'Heading',
      props: {},
      align: 'full',
      styleOverride: { base: { hoverEffect: 'lift' } },
    };
    const { result, bridge } = setupCanvas([wide], wide);

    act(() => result.current.handleDuplicateSelected());
    await flush();

    expect(bridge.insertBlock).toHaveBeenCalledWith(
      '<div>fragment</div>',
      null,
      null,
      { align: 'full', styleOverride: { base: { hoverEffect: 'lift' } } },
    );
  });

  it('grafts a strip in order in front of the block that stood where it goes', async () => {
    const first: Block = { id: 'first', type: 'Heading', props: {} };
    const last: Block = { id: 'last', type: 'Heading', props: {} };
    const { result, onChange, bridge } = setupCanvas([first, last], first);
    vi.mocked(blockFragmentApi.renderBlockFragment).mockImplementation(
      async (input) => `<div>${input.blockId}</div>`,
    );

    act(() => result.current.handlePasteMany(strip));
    await flush();
    await flush();

    const pasted = (onChange.mock.calls.at(-1)?.[0] ?? [])
      .map((block) => block.id)
      .slice(1, 3);
    expect(bridge.insertBlock.mock.calls).toEqual(
      pasted.map((id) => [`<div>${id}</div>`, null, 'last', {}]),
    );
  });

  it('drops the fragments of a strip that was undone while they were rendering', async () => {
    const { result, bridge } = setupCanvas([]);
    const release = holdFragments();

    act(() => result.current.handleInsertBlocks(strip));
    act(() => result.current.undo());
    await release();

    expect(bridge.removeBlock.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    expect(bridge.insertBlock).not.toHaveBeenCalled();
  });

  it('grafts each block once when undo and redo both land before the fragments do', async () => {
    const { result, bridge } = setupCanvas([]);
    const release = holdFragments();

    act(() => result.current.handleInsertBlocks(strip));
    act(() => result.current.undo());
    act(() => result.current.redo());
    await release();

    expect(bridge.insertBlock).toHaveBeenCalledTimes(2);
  });

  /*
   * React calls state updaters twice under StrictMode, which the editor
   * runs in development. Redo used to insert from inside one.
   */
  it('redoes an insert once under StrictMode', async () => {
    const { result, bridge } = setupCanvas([], null, { strict: true });

    act(() => result.current.handleInsertBlocks([strip[0]]));
    await flush();
    act(() => result.current.undo());
    act(() => result.current.redo());
    await flush();

    expect(bridge.removeBlock).toHaveBeenCalledTimes(1);
    expect(bridge.insertBlock).toHaveBeenCalledTimes(2);
  });

  it('sends the style sheet for the tree an undo or a redo puts back', () => {
    const original: Block[] = [
      {
        id: 'styled',
        type: 'Heading',
        props: {},
        styleOverride: { base: { textColor: '#ff0000' } },
      },
    ];
    const { result, refreshStyleSheet } = setupCanvas(original);

    act(() => result.current.handleInsertBlocks([strip[0]]));
    const inserted = refreshStyleSheet.mock.calls.at(-1)?.[0];
    act(() => result.current.undo());
    expect(refreshStyleSheet.mock.calls.at(-1)?.[0]).toEqual(original);
    act(() => result.current.redo());
    expect(refreshStyleSheet.mock.calls.at(-1)?.[0]).toEqual(inserted);
  });

  it('re-renders the container a strip goes into, and re-renders it without the strip on undo', async () => {
    const box: Block = {
      id: 'box',
      type: 'Container',
      props: {},
      children: [{ id: 'kept', type: 'Heading', props: {} }],
    };
    const { result, bridge } = setupCanvas([box], box);

    act(() => result.current.handleInsertBlocks(strip));
    await flush();
    act(() => result.current.undo());
    await flush();

    const renders = vi
      .mocked(blockFragmentApi.renderBlockFragment)
      .mock.calls.map(([input]) => [
        input.blockId,
        (input.children ?? []).map((child) => child.id),
      ]);
    expect(renders).toEqual([
      ['box', ['kept', 'a', 'b']],
      ['box', ['kept']],
    ]);
    expect(bridge.patchBlock).toHaveBeenCalledTimes(2);
    expect(bridge.insertBlock).not.toHaveBeenCalled();
  });

  /*
   * A reusable section's blocks are grafted on when the page is read; the
   * fragment endpoint only has the block it is handed, and rendered the
   * section as "not published yet".
   */
  it('reloads the canvas for a pasted reusable section instead of rendering a placeholder', async () => {
    const { result, reloadCanvas, bridge } = setupCanvas([]);

    act(() =>
      result.current.handlePasteMany([
        { id: 'h', type: 'Heading', props: {} },
        {
          id: 'shared',
          type: 'Section',
          props: { section: { sectionId: 's1', sectionName: 'Footer CTA' } },
        },
      ]),
    );
    await flush();

    expect(reloadCanvas).toHaveBeenCalledTimes(1);
    expect(blockFragmentApi.renderBlockFragment).not.toHaveBeenCalled();
    expect(bridge.insertBlock).not.toHaveBeenCalled();
  });

  it('re-renders a container holding a section the page already uses, once the draft is saved', async () => {
    const box: Block = {
      id: 'box',
      type: 'Container',
      props: {},
      children: [
        {
          id: 'shared',
          type: 'Section',
          props: { section: { sectionId: 's1', sectionName: 'Footer CTA' } },
        },
      ],
    };
    const { result, reloadCanvas, whenSaved } = setupCanvas([box], box);

    act(() => result.current.handleInsert(heading));
    await flush();
    await flush();

    // The server renders the section from the page it belongs to, so the
    // draft has to have landed before it is asked for it.
    expect(whenSaved).toHaveBeenCalled();
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalled();
    expect(reloadCanvas).not.toHaveBeenCalled();
  });

  it('still reloads for a section the page does not use yet', async () => {
    const { result, reloadCanvas } = setupCanvas([]);

    act(() =>
      result.current.handleInsertBlocks([
        { id: 'h', type: 'Heading', props: {} },
        {
          id: 'fresh',
          type: 'Section',
          props: { section: { sectionId: 'brand-new', sectionName: 'CTA' } },
        },
      ]),
    );
    await flush();

    expect(reloadCanvas).toHaveBeenCalledTimes(1);
    expect(blockFragmentApi.renderBlockFragment).not.toHaveBeenCalled();
  });

  /*
   * A page list, a filter and an article's own date are all filled in
   * when the page is READ. Patched in from the editor's own copy they
   * draw an empty block — a list with ten entries showing "nothing here"
   * — so inserting one is a case for a reload, like a section the page
   * does not use yet.
   */
  it('reloads for a block the server fills in, rather than patching an empty one', async () => {
    const { result, reloadCanvas } = setupCanvas([]);

    act(() =>
      result.current.handleInsertBlocks([
        {
          id: 'grid',
          type: 'PageGrid',
          props: { termId: 'term-1', items: [] },
        },
      ]),
    );
    await flush();

    expect(reloadCanvas).toHaveBeenCalledTimes(1);
    expect(blockFragmentApi.renderBlockFragment).not.toHaveBeenCalled();
  });

  it('reloads for one nested inside a container too', async () => {
    const { result, reloadCanvas } = setupCanvas([]);

    act(() =>
      result.current.handleInsertBlocks([
        {
          id: 'box',
          type: 'Container',
          props: {},
          children: [
            { id: 'filter', type: 'TermList', props: { taxonomyId: 'tax-1' } },
          ],
        },
      ]),
    );
    await flush();

    expect(reloadCanvas).toHaveBeenCalledTimes(1);
  });

  /*
   * Undo used to replay the forward steps against the old tree: a block
   * moved from the page into a container was removed from the canvas
   * instead of coming back.
   */
  it('puts a block moved into a container back on the page when the move is undone', async () => {
    const tree: Block[] = [
      { id: 'lone', type: 'Heading', props: {} },
      { id: 'box', type: 'Container', props: {}, children: [] },
    ];
    const { result, bridge } = setupCanvas(tree);
    vi.mocked(blockFragmentApi.renderBlockFragment).mockImplementation(
      async (input) => `<div>${input.blockId}</div>`,
    );

    act(() => result.current.handleReparent('lone', 'box', 0));
    await flush();
    expect(bridge.removeBlock).toHaveBeenCalledWith('lone');
    expect(bridge.patchBlock).toHaveBeenLastCalledWith('box', '<div>box</div>');

    act(() => result.current.undo());
    await flush();

    expect(bridge.insertBlock).toHaveBeenCalledWith(
      '<div>lone</div>',
      null,
      'box',
      {},
    );
    expect(
      vi.mocked(blockFragmentApi.renderBlockFragment).mock.calls.at(-2)?.[0]
        .children,
    ).toEqual([]);
  });

  /*
   * A copy used to be rendered without its variant and without its own
   * style, and the editor's style sheet was never told a new instance
   * existed: a styled block duplicated in the canvas showed up plain until
   * the page was reloaded.
   */
  it('renders a duplicated block with its variant and its own style, and refreshes the style sheet', async () => {
    const styled: Block = {
      id: 'styled',
      type: 'Heading',
      props: { text: 'Hi', level: 'h2' },
      variant: 'accent',
      styleOverride: { base: { textColor: '#ff0000' } },
    };
    const { result, refreshStyleSheet } = setupCanvas([styled], styled);

    act(() => result.current.handleDuplicateSelected());
    await flush();

    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'accent',
        styleOverride: { base: { textColor: '#ff0000' } },
      }),
    );
    const refreshedWith = refreshStyleSheet.mock.calls.at(-1)?.[0] ?? [];
    expect(refreshedWith).toHaveLength(2);
  });

  it('re-renders a styled container that gains a child with its variant and its own style', async () => {
    const container: Block = {
      id: 'box',
      type: 'Container',
      props: {},
      variant: 'boxed',
      styleOverride: { base: { backgroundColor: '#000000' } },
      children: [],
    };
    const { result, bridge } = setupCanvas([container], container);

    act(() => result.current.handleInsert(heading));
    await flush();

    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: 'box',
        variant: 'boxed',
        styleOverride: { base: { backgroundColor: '#000000' } },
      }),
    );
    expect(bridge.patchBlock).toHaveBeenCalledWith(
      'box',
      '<div>fragment</div>',
    );
  });

  it('puts a template of several blocks into the canvas in place, in order, and takes it all back with one undo', async () => {
    const original: Block[] = [
      { id: 'existing', type: 'Heading', props: { text: 'x', level: 'h2' } },
    ];
    const { result, onChange, reloadCanvas, bridge } = setupCanvas(original);

    act(() =>
      result.current.handleInsertBlocks([
        { id: 'a', type: 'Heading', props: {} },
        { id: 'b', type: 'Heading', props: {} },
        { id: 'c', type: 'Heading', props: {} },
      ]),
    );
    await flush();
    await flush();
    await flush();

    expect(reloadCanvas).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(blockFragmentApi.renderBlockFragment)
        .mock.calls.map(([input]) => input.blockId),
    ).toEqual(['a', 'b', 'c']);
    expect(bridge.insertBlock).toHaveBeenCalledTimes(3);

    act(() => result.current.undo());

    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(original);
    expect(bridge.removeBlock.mock.calls.map(([id]) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  /*
   * Two inserts into the same container are two history entries, each with
   * its own turn, so the render that came back second used to win — showing
   * the container as it was one change ago.
   */
  it('shows the newest render of a container, whichever change asked for it', async () => {
    const box: Block = {
      id: 'box',
      type: 'Container',
      props: {},
      children: [],
    };
    const { result, bridge } = setupCanvas([box], box);
    const release = holdFragments();

    act(() => result.current.handleInsert(heading));
    act(() => result.current.handleInsert(heading));
    // Newest first: the older render lands last and must not be applied.
    await release({ newestFirst: true });

    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledTimes(2);
    expect(bridge.patchBlock).toHaveBeenCalledTimes(1);
  });

  it('drops the re-render of a container whose insert was undone while it rendered', async () => {
    const box: Block = {
      id: 'box',
      type: 'Container',
      props: {},
      children: [],
    };
    const { result, bridge } = setupCanvas([box], box);
    const release = holdFragments();

    act(() => result.current.handleInsert(heading));
    act(() => result.current.undo());
    await release();

    // Both renders happen; only the undo's own reaches the canvas.
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledTimes(2);
    expect(bridge.patchBlock).toHaveBeenCalledTimes(1);
  });

  it('re-renders rather than reload when an edit is undone on a container holding a section the page uses', async () => {
    const box: Block = {
      id: 'box',
      type: 'Container',
      props: { title: 'before' },
      children: [
        {
          id: 'shared',
          type: 'Section',
          props: { section: { sectionId: 's1', sectionName: 'Footer CTA' } },
        },
      ],
    };
    const edited: Block[] = [{ ...box, props: { title: 'after' } }];
    const { result, reloadCanvas } = setupCanvas([box], box);

    act(() => result.current.recordEdit('box', edited));
    act(() => result.current.undo());
    await flush();

    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalled();
    expect(reloadCanvas).not.toHaveBeenCalled();
  });

  /*
   * Alignment is an attribute on the wrapper around the block, so it never
   * went through a render — and used not to go through the history either,
   * which left the tree and the canvas disagreeing after an undo.
   */
  it('takes back the width a root block was given, in the tree and on the canvas', () => {
    const hero: Block = { id: 'hero', type: 'Heading', props: {} };
    const { result, onChange, bridge } = setupCanvas([hero], hero);

    act(() => result.current.handleAlignSelected('full'));

    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([
      { ...hero, align: 'full' },
    ]);
    expect(bridge.setRootLayout).toHaveBeenCalledWith('hero', 'full', null);

    act(() => result.current.undo());

    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([hero]);
    expect(bridge.setRootLayout).toHaveBeenLastCalledWith('hero', null, null);
  });

  it('gives every pasted copy a fresh id', () => {
    const original: Block[] = [
      { id: 'existing', type: 'Heading', props: { text: 'x', level: 'h2' } },
    ];
    const { result, onChange } = setupCanvas(original);

    act(() =>
      result.current.handlePasteMany([
        { id: 'copied-1', type: 'Heading', props: {} },
        { id: 'copied-2', type: 'Heading', props: {} },
      ]),
    );

    const ids = (onChange.mock.calls.at(-1)?.[0] ?? []).map((b) => b.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('copied-1');
    expect(ids).not.toContain('copied-2');
  });
});

/*
 * Some blocks only make sense inside one container: a Column without the
 * Columns grid is a plain box. The insert paths ask before placing, and say
 * so when there is nowhere to place.
 */
describe('useBlockTreeMutations places a block only where it belongs', () => {
  const columns: BlockDescriptor = {
    type: 'Columns',
    label: 'Columns',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
    allowedChildTypes: ['Column'],
  };
  const column: BlockDescriptor = {
    type: 'Column',
    label: 'Column',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
    allowedParentTypes: ['Columns'],
  };
  const heading: BlockDescriptor = {
    type: 'Heading',
    label: 'Heading',
    category: 'content',
    defaultProps: {},
    fields: [],
  };

  const grid: Block = {
    id: 'grid',
    type: 'Columns',
    props: {},
    children: [{ id: 'col-1', type: 'Column', props: {}, children: [] }],
  };
  const tree: Block[] = [{ id: 'intro', type: 'Heading', props: {} }, grid];

  function setupPlacement(selected: Block | null) {
    const onChange = vi.fn<(blocks: Block[]) => void>();
    const onPlacementRefused = vi.fn<(types: string[]) => void>();
    const { result } = renderHook(() =>
      useBlockTreeMutations({
        localBlocks: tree,
        setLocalBlocks: vi.fn(),
        onChange,
        registry: [columns, column, heading],
        bridge: {
          selectedBlockId: selected?.id ?? null,
          patchBlock: vi.fn(),
          insertBlock: vi.fn(),
          removeBlock: vi.fn(),
          reorderBlocks: vi.fn(),
          setRootLayout: vi.fn(),
        },
        token: null,
        pageId: 'page-1',
        onPlacementRefused,
        selectedBlock: selected,
        selectedDescriptor: undefined,
        canvasReady: true,
      }),
    );
    return { result, onChange, onPlacementRefused };
  }

  it('does not offer a column while nothing holds it', () => {
    const { result } = setupPlacement(null);

    expect(result.current.canInsertType('Column')).toBe(false);
    expect(result.current.canInsertType('Heading')).toBe(true);
  });

  it('offers it once the grid it belongs in is selected', () => {
    const { result } = setupPlacement(grid);

    expect(result.current.canInsertType('Column')).toBe(true);
  });

  it('offers it beside a column too, where it lands in the same grid', () => {
    const { result } = setupPlacement(grid.children?.[0] ?? null);

    expect(result.current.canInsertType('Column')).toBe(true);
  });

  it('refuses to paste one where nothing can hold it, and says so', () => {
    const { result, onChange, onPlacementRefused } = setupPlacement(null);

    act(() =>
      result.current.handlePaste({ id: 'copied', type: 'Column', props: {} }),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(onPlacementRefused).toHaveBeenCalledWith(['Column']);
  });

  it('still pastes it into the grid that holds it', () => {
    const { result, onChange, onPlacementRefused } = setupPlacement(
      grid.children?.[0] ?? null,
    );

    act(() =>
      result.current.handlePaste({ id: 'copied', type: 'Column', props: {} }),
    );

    expect(onPlacementRefused).not.toHaveBeenCalled();
    expect(
      (onChange.mock.calls.at(-1)?.[0] ?? [])[1]?.children?.map((c) => c.type),
    ).toEqual(['Column', 'Column']);
  });
});

describe('useBlockTreeMutations takes a generated page as one step', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const existing: Block[] = [
    { id: 'old-1', type: 'Hero', props: { title: 'Prima' } },
    { id: 'old-2', type: 'Hero', props: { title: 'Seconda' } },
  ];
  const generated = [
    { id: 'new-1', type: 'Hero', props: { title: 'Nuova' } },
    { id: 'new-2', type: 'Hero', props: { title: 'Altra' } },
  ];

  function setupWithReload() {
    const onChange = vi.fn();
    const reloadCanvas = vi.fn();
    const { result } = renderHook(() =>
      useBlockTreeMutations({
        localBlocks: existing,
        setLocalBlocks: vi.fn(),
        onChange,
        registry: [heroDescriptor],
        bridge: {
          selectedBlockId: null,
          patchBlock: vi.fn(),
          insertBlock: vi.fn(),
          removeBlock: vi.fn(),
          reorderBlocks: vi.fn(),
          setRootLayout: vi.fn(),
        },
        token: 'tok',
        pageId: 'page-1',
        reloadCanvas,
        selectedBlock: null,
        selectedDescriptor: undefined,
        canvasReady: true,
      }),
    );
    return { result, onChange, reloadCanvas };
  }

  it('adds the blocks at the end of the page, whatever is selected', () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div />',
    );
    const { result, onChange } = setupWithReload();

    act(() => result.current.handleAppendBlocks(generated));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((block: Block) => block.id)).toEqual([
      'old-1',
      'old-2',
      'new-1',
      'new-2',
    ]);
    expect(result.current.canUndo).toBe(true);
  });

  it('replaces the whole page, reloads the canvas, and gives it back on undo', () => {
    const { result, onChange, reloadCanvas } = setupWithReload();

    act(() => result.current.handleReplaceAll(generated));

    expect(onChange).toHaveBeenLastCalledWith(generated);
    expect(reloadCanvas).toHaveBeenCalledTimes(1);

    act(() => result.current.undo());

    expect(onChange).toHaveBeenLastCalledWith(existing);
    expect(reloadCanvas).toHaveBeenCalledTimes(2);
    expect(result.current.canRedo).toBe(true);
  });
});
