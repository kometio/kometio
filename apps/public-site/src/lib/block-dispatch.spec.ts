import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-sdk';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { coreDispatchEntries } from './block-dispatch';
import type { BlockRenderContext } from './block-render-context';

const component = (() => null) as unknown as AstroComponentFactory;

function descriptor(
  type: string,
  rest: Partial<BlockDescriptor> = {},
): BlockDescriptor {
  return {
    type,
    label: `blocks.${type}.label`,
    category: 'content',
    defaultProps: {},
    fields: [],
    ...rest,
  };
}

function entriesFor(...descriptors: BlockDescriptor[]) {
  return coreDispatchEntries(descriptors, () => component);
}

const context = (
  children?: BlockRenderContext['block']['children'],
): BlockRenderContext =>
  ({
    block: { id: 'b1', type: 'X', props: {}, children },
    locale: 'it',
    translations: [],
    ancestors: [],
    currentPageTitle: '',
  }) as unknown as BlockRenderContext;

describe('coreDispatchEntries', () => {
  it('takes a style only for a type whose descriptor lists style properties', () => {
    const entries = entriesFor(
      descriptor('Plain'),
      descriptor('Styled', { stylableProperties: ['textColor'] }),
    );

    expect(entries['Plain']?.stylable).toBe(false);
    expect(entries['Styled']?.stylable).toBe(true);
  });

  it('recurses into the children of a container and hands it the slot props', () => {
    const entries = entriesFor(
      descriptor('Box', { isContainer: true }),
      descriptor('Leaf'),
    );

    expect(entries['Box']).toMatchObject({
      recurseChildren: true,
      containerProps: true,
    });
    expect(entries['Leaf']).toMatchObject({
      recurseChildren: false,
      containerProps: false,
    });
  });

  it.each(['Nav', 'HamburgerMenu', 'NavDropdown', 'Tab'])(
    'recurses into %s without treating its children as a slot',
    (type) => {
      const entry = entriesFor(descriptor(type, { isContainer: true }))[type];

      expect(entry).toMatchObject({
        recurseChildren: true,
        containerProps: false,
      });
    },
  );

  it("draws a Section's children although the page tree does not hold them", () => {
    expect(entriesFor(descriptor('Section'))['Section']).toMatchObject({
      recurseChildren: true,
      containerProps: true,
    });
  });

  it('hands a container that draws from its children those children as items', () => {
    const entry = entriesFor(descriptor('Faq', { rendersFromChildren: true }))[
      'Faq'
    ];
    const child = { id: 'q1', type: 'Question', props: {} };

    expect(entry?.extra?.(context([child]))).toEqual({ items: [child] });
    expect(entry?.extra?.(context())).toEqual({ items: [] });
  });

  it('gives Columns the width of each of its columns instead', () => {
    const entry = entriesFor(
      descriptor('Columns', { isContainer: true, rendersFromChildren: true }),
    )['Columns'];

    expect(Object.keys(entry?.extra?.(context([])) ?? {})).toEqual([
      'columnSpans',
    ]);
  });

  it('refuses a registered type that has no component', () => {
    expect(() =>
      coreDispatchEntries([descriptor('Ghost')], () => undefined),
    ).toThrow(/Ghost.*components\/blocks\/Ghost\.astro/);
  });
});

describe('the core registry, dispatched', () => {
  const descriptors = [...pageBlocks, ...headerFooterBlocks];
  const entries = coreDispatchEntries(descriptors, () => component);

  it('has an entry for every type, once', () => {
    const types = new Set(descriptors.map((d) => d.type));

    expect(Object.keys(entries).sort()).toEqual([...types].sort());
  });

  it('hands every container that draws from its children what it draws from', () => {
    for (const d of descriptors.filter((x) => x.rendersFromChildren)) {
      expect(entries[d.type]?.extra, d.type).toBeTypeOf('function');
    }
  });

  it('flags as style-taking exactly the types that list style properties', () => {
    for (const d of descriptors) {
      expect(entries[d.type]?.stylable, d.type).toBe(
        (d.stylableProperties?.length ?? 0) > 0,
      );
    }
  });
});
