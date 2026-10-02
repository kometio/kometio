import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-sdk';
import {
  buildDispatchEntry,
  buildThemeBlocksResponseEntry,
  checkCoreTypeCollisions,
} from './resolve-theme-page-blocks-helpers';

const descriptor: BlockDescriptor = {
  type: 'Faq',
  label: 'blocks.faq.label',
  category: 'content',
  defaultProps: { question: '' },
  fields: [
    {
      kind: 'text',
      key: 'question',
      label: 'blocks.faq.fields.question.fieldLabel',
    },
  ],
};

describe('checkCoreTypeCollisions', () => {
  it('flags a theme block type that matches an existing core type', () => {
    const errors = checkCoreTypeCollisions(
      [
        {
          basename: 'Hero',
          descriptor: { ...descriptor, type: 'Hero' },
          hasRenderComponent: true,
          locales: undefined,
        },
      ],
      ['Hero', 'Text', 'Image'],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(
      'collides with an existing core block',
    );
  });

  it('passes a theme block whose type is genuinely new', () => {
    const errors = checkCoreTypeCollisions(
      [
        {
          basename: 'Faq',
          descriptor,
          hasRenderComponent: true,
          locales: undefined,
        },
      ],
      ['Hero', 'Text', 'Image'],
    );
    expect(errors).toEqual([]);
  });
});

describe('buildDispatchEntry', () => {
  const component = (() => null) as unknown as Parameters<
    typeof buildDispatchEntry
  >[1];
  const schema = {
    parse: (props: unknown) => props as Record<string, unknown>,
  };

  it('marks the block stylable only when stylableProperties is non-empty', () => {
    expect(buildDispatchEntry(descriptor, component, schema).stylable).toBe(
      false,
    );
    expect(
      buildDispatchEntry(
        { ...descriptor, stylableProperties: ['textColor'] },
        component,
        schema,
      ).stylable,
    ).toBe(true);
  });

  it('maps isContainer to recurseChildren + containerProps', () => {
    const entry = buildDispatchEntry(
      { ...descriptor, isContainer: true },
      component,
      schema,
    );
    expect(entry.recurseChildren).toBe(true);
    expect(entry.containerProps).toBe(true);
  });

  it('omits recurseChildren/containerProps for a non-container block', () => {
    const entry = buildDispatchEntry(descriptor, component, schema);
    expect(entry.recurseChildren).toBeUndefined();
    expect(entry.containerProps).toBeUndefined();
  });
});

describe('buildThemeBlocksResponseEntry', () => {
  const locales = {
    en: { label: 'FAQ', fields: { question: { fieldLabel: 'Question' } } },
    it: { label: 'FAQ', fields: { question: { fieldLabel: 'Domanda' } } },
  };

  it('builds a valid wire entry from an already-validated candidate', () => {
    const entry = buildThemeBlocksResponseEntry({
      basename: 'Faq',
      descriptor,
      hasRenderComponent: true,
      locales,
    });
    expect(entry.descriptor.type).toBe('Faq');
    expect(entry.locales.en.label).toBe('FAQ');
  });

  it('throws if locales is missing (validation should have caught this first)', () => {
    expect(() =>
      buildThemeBlocksResponseEntry({
        basename: 'Faq',
        descriptor,
        hasRenderComponent: true,
        locales: undefined,
      }),
    ).toThrow();
  });
});
