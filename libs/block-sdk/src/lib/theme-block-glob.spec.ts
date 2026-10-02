import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from './field-types';
import { collectThemeBlockCandidates } from './theme-block-glob';

const descriptor: BlockDescriptor = {
  type: 'Faq',
  label: 'blocks.faq.label',
  category: 'content',
  defaultProps: {},
  fields: [],
};

describe('collectThemeBlockCandidates', () => {
  it('pairs a .block.ts with its matching .astro and .locales.json by basename', () => {
    const candidates = collectThemeBlockCandidates(
      { './Faq.block.ts': { default: descriptor } },
      { './Faq.astro': {} },
      { './Faq.locales.json': { en: { label: 'FAQ' }, it: { label: 'FAQ' } } },
    );

    expect(candidates).toEqual([
      {
        basename: 'Faq',
        descriptor,
        hasRenderComponent: true,
        locales: { en: { label: 'FAQ' }, it: { label: 'FAQ' } },
      },
    ]);
  });

  it('marks hasRenderComponent false when no matching .astro exists', () => {
    const candidates = collectThemeBlockCandidates(
      { './Faq.block.ts': { default: descriptor } },
      {},
      {},
    );

    expect(candidates[0].hasRenderComponent).toBe(false);
    expect(candidates[0].locales).toBeUndefined();
  });

  it('returns an empty array for a theme with no new blocks yet', () => {
    expect(collectThemeBlockCandidates({}, {}, {})).toEqual([]);
  });

  it('does not pair files with different basenames', () => {
    const candidates = collectThemeBlockCandidates(
      { './Faq.block.ts': { default: descriptor } },
      { './OtherBlock.astro': {} },
      {},
    );

    expect(candidates[0].hasRenderComponent).toBe(false);
  });
});
