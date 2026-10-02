import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ToastProvider } from '../shell/toast-provider';
import { useSelectedBlockEditing } from './use-selected-block-editing';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/*
 * A block's own style reaches the canvas as a RULE in the editor's style
 * sheet, not through its fragment. The sheet was built from the draft ref,
 * which only catches up after the next render: every style edit sent the
 * sheet as it was before that edit.
 */
describe('useSelectedBlockEditing', () => {
  it('sends the style sheet built from the tree WITH the style just set', () => {
    const block: Block = { id: 'h1', type: 'Heading', props: {} };
    const tree = [block];
    const refresh = vi.fn<(tree?: Block[]) => void>();
    const setRootLayout =
      vi.fn<
        (blockId: string, align: string | null, hover: string | null) => void
      >();
    const { result } = renderHook(
      () =>
        useSelectedBlockEditing({
          siteId: undefined,
          selectedBlock: block,
          selectedDescriptor: undefined,
          registry: [],
          breakpoint: 'base',
          bridge: { setRootLayout },
          styleSheet: { refresh },
          localBlocksRef: { current: tree },
          setLocalBlocks: vi.fn(),
          onChange: vi.fn(),
          patch: {
            scheduleChange: vi.fn(),
            scheduleVariantChange: vi.fn(),
            scheduleStyleOverrideChange: vi.fn(),
          },
        }),
      { wrapper },
    );

    act(() =>
      result.current.handleChangeStyleOverride({ textColor: '#ff0000' }),
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0]).toEqual([
      { ...block, styleOverride: { base: { textColor: '#ff0000' } } },
    ]);
  });

  /*
   * A hover effect is two declarations and a transition on the WRAPPER
   * around a root block, not a rule keyed by the block — so no style sheet
   * and no re-render carries it. Setting one in the canvas did nothing
   * visible until the page was reloaded.
   */
  it('sends the hover effect of a root block to its wrapper', () => {
    const block: Block = {
      id: 'h1',
      type: 'Heading',
      props: {},
      align: 'full',
    };
    const refresh = vi.fn<(tree?: Block[]) => void>();
    const setRootLayout =
      vi.fn<
        (blockId: string, align: string | null, hover: string | null) => void
      >();
    const { result } = renderHook(
      () =>
        useSelectedBlockEditing({
          siteId: undefined,
          selectedBlock: block,
          selectedDescriptor: undefined,
          registry: [],
          breakpoint: 'base',
          bridge: { setRootLayout },
          styleSheet: { refresh },
          localBlocksRef: { current: [block] },
          setLocalBlocks: vi.fn(),
          onChange: vi.fn(),
          patch: {
            scheduleChange: vi.fn(),
            scheduleVariantChange: vi.fn(),
            scheduleStyleOverrideChange: vi.fn(),
          },
        }),
      { wrapper },
    );

    act(() =>
      result.current.handleChangeStyleOverride({ hoverEffect: 'lift' }),
    );

    expect(setRootLayout).toHaveBeenCalledWith('h1', 'full', 'lift');
  });

  it('leaves the wrapper alone for a nested block, which has none', () => {
    const child: Block = { id: 'inner', type: 'Heading', props: {} };
    const tree: Block[] = [
      { id: 'box', type: 'Container', props: {}, children: [child] },
    ];
    const setRootLayout =
      vi.fn<
        (blockId: string, align: string | null, hover: string | null) => void
      >();
    const { result } = renderHook(
      () =>
        useSelectedBlockEditing({
          siteId: undefined,
          selectedBlock: child,
          selectedDescriptor: undefined,
          registry: [],
          breakpoint: 'base',
          bridge: { setRootLayout },
          styleSheet: { refresh: vi.fn() },
          localBlocksRef: { current: tree },
          setLocalBlocks: vi.fn(),
          onChange: vi.fn(),
          patch: {
            scheduleChange: vi.fn(),
            scheduleVariantChange: vi.fn(),
            scheduleStyleOverrideChange: vi.fn(),
          },
        }),
      { wrapper },
    );

    act(() =>
      result.current.handleChangeStyleOverride({ hoverEffect: 'lift' }),
    );

    expect(setRootLayout).not.toHaveBeenCalled();
  });

  /*
   * A glossary's A–Z index is made of its terms, a playlist's list of its
   * videos' captions. The canvas re-rendered only the edited child, so a
   * term renamed from "Beta" to "Zeta" stayed filed under B until a reload
   * — found live on the canvas, not by reading.
   */
  describe('a child whose parent draws from its children', () => {
    const registry: BlockDescriptor[] = [
      {
        type: 'Glossary',
        label: 'Glossary',
        category: 'content',
        defaultProps: {},
        fields: [],
        isContainer: true,
        rendersFromChildren: true,
      },
      {
        type: 'Container',
        label: 'Container',
        category: 'layout',
        defaultProps: {},
        fields: [],
        isContainer: true,
      },
    ];

    function editChild(parentType: string) {
      const child: Block = {
        id: 'term',
        type: 'GlossaryTerm',
        props: { term: 'Beta', definition: '' },
      };
      const parent: Block = {
        id: 'parent',
        type: parentType,
        props: {},
        children: [child],
      };
      const scheduleChange = vi.fn();
      const { result } = renderHook(
        () =>
          useSelectedBlockEditing({
            siteId: undefined,
            selectedBlock: child,
            selectedDescriptor: undefined,
            registry,
            breakpoint: 'base',
            bridge: { setRootLayout: vi.fn() },
            styleSheet: { refresh: vi.fn() },
            localBlocksRef: { current: [parent] },
            setLocalBlocks: vi.fn(),
            onChange: vi.fn(),
            patch: {
              scheduleChange,
              scheduleVariantChange: vi.fn(),
              scheduleStyleOverrideChange: vi.fn(),
            },
          }),
        { wrapper },
      );
      act(() => result.current.handleChangeProp('term', 'Zeta'));
      return scheduleChange.mock.calls[0];
    }

    it('saves the child and re-renders the parent with the edit inside it', () => {
      const [blockId, , key, props, , , renderInstead] = editChild('Glossary');

      expect([blockId, key, props]).toEqual([
        'term',
        'term',
        { term: 'Zeta', definition: '' },
      ]);
      expect(renderInstead).toMatchObject({
        id: 'parent',
        type: 'Glossary',
        children: [{ id: 'term', props: { term: 'Zeta' } }],
      });
    });

    it('re-renders only the child when the parent does not read its children', () => {
      const call = editChild('Container');
      expect(call[6]).toBeUndefined();
    });
  });
});
