import { describe, expect, it } from 'vitest';
import { computeContentStructureSignature } from './content-structure-signature';
import type { PageContent } from './content-model';

describe('computeContentStructureSignature', () => {
  it('is identical for the same block types regardless of prop values', () => {
    const a: PageContent = [
      { type: 'Hero', props: { title: 'Ciao' } },
      { type: 'Text', props: { body: 'Uno' } },
    ];
    const b: PageContent = [
      { type: 'Hero', props: { title: 'Bonjour' } },
      { type: 'Text', props: { body: 'Deux' } },
    ];

    expect(computeContentStructureSignature(a)).toBe(
      computeContentStructureSignature(b),
    );
  });

  it('differs when a block is added', () => {
    const original: PageContent = [{ type: 'Hero', props: {} }];
    const withExtraBlock: PageContent = [
      { type: 'Hero', props: {} },
      { type: 'Text', props: {} },
    ];

    expect(computeContentStructureSignature(original)).not.toBe(
      computeContentStructureSignature(withExtraBlock),
    );
  });

  it('differs when blocks are reordered', () => {
    const a: PageContent = [
      { type: 'Hero', props: {} },
      { type: 'Text', props: {} },
    ];
    const b: PageContent = [
      { type: 'Text', props: {} },
      { type: 'Hero', props: {} },
    ];

    expect(computeContentStructureSignature(a)).not.toBe(
      computeContentStructureSignature(b),
    );
  });

  it('accounts for nested children, not just top-level blocks', () => {
    const withChild: PageContent = [
      { type: 'Container', props: {}, children: [{ type: 'Text', props: {} }] },
    ];
    const withoutChild: PageContent = [{ type: 'Container', props: {} }];

    expect(computeContentStructureSignature(withChild)).not.toBe(
      computeContentStructureSignature(withoutChild),
    );
  });

  it('ignores styleOverride and id, only structure', () => {
    const a: PageContent = [
      {
        id: 'block-1',
        type: 'Hero',
        props: {},
        styleOverride: { base: { borderRadius: '4px' } },
      },
    ];
    const b: PageContent = [{ id: 'block-2', type: 'Hero', props: {} }];

    expect(computeContentStructureSignature(a)).toBe(
      computeContentStructureSignature(b),
    );
  });
});
