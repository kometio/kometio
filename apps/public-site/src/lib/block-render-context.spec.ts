import { describe, expect, it } from 'vitest';
import type { PublishedSite } from '@kometio/api-contracts';
import {
  COMPUTED_BLOCK_PROPS,
  commonBlockProps,
  type BlockRenderContext,
} from './block-render-context';

function context(
  overrides: Partial<BlockRenderContext> = {},
): BlockRenderContext {
  return {
    block: { id: 'b1', type: 'Card', props: {} },
    locale: 'it',
    translations: [{ locale: 'en', slug: 'hello', ancestorSlugs: [] }],
    site: { themeName: 'classic' } as PublishedSite,
    ancestors: [{ slug: 'servizi', title: 'Servizi' }],
    currentPageTitle: 'Chi siamo',
    editable: true,
    ...overrides,
  };
}

describe('commonBlockProps', () => {
  it("hands every block the page's locale, site and position, not only the ones that asked", () => {
    const ctx = context();

    expect(commonBlockProps(ctx)).toEqual({
      locale: 'it',
      editable: true,
      site: ctx.site,
      translations: ctx.translations,
      ancestors: ctx.ancestors,
      currentPageTitle: 'Chi siamo',
    });
  });

  it('leaves editable undefined on a published page', () => {
    expect(commonBlockProps(context({ editable: undefined })).editable).toBe(
      undefined,
    );
  });
});

describe('COMPUTED_BLOCK_PROPS', () => {
  it('gives a glossary term its own id, for the index to link to', () => {
    expect(COMPUTED_BLOCK_PROPS['GlossaryTerm']?.(context())).toEqual({
      blockId: 'b1',
    });
  });

  it('gives Columns one track per child column', () => {
    const columns = context({
      block: {
        id: 'c1',
        type: 'Columns',
        props: {},
        children: [
          { id: 'a', type: 'Column', props: { span: 4 } },
          { id: 'b', type: 'Column', props: {} },
        ],
      },
    });

    expect(COMPUTED_BLOCK_PROPS['Columns']?.(columns)).toEqual({
      columnSpans: [4, 8],
    });
  });

  it('gives the share buttons the title of the page they share', () => {
    const props = COMPUTED_BLOCK_PROPS['ShareButtons']?.(context());

    expect(props).toMatchObject({ pageTitle: 'Chi siamo' });
    expect(Object.keys(props?.['brandIcons'] ?? {})).toEqual([
      'whatsapp',
      'facebook',
      'x',
    ]);
  });
});
