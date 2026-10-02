import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from './field-types';
import {
  validateThemeBlockSet,
  type ThemeBlockCandidate,
} from './validate-theme-blocks';

function validDescriptor(
  overrides: Partial<BlockDescriptor> = {},
): BlockDescriptor {
  return {
    type: 'Faq',
    label: 'blocks.faq.label',
    category: 'content',
    defaultProps: { question: '', answer: '' },
    fields: [
      {
        kind: 'text',
        key: 'question',
        label: 'blocks.faq.fields.question.fieldLabel',
      },
      {
        kind: 'select',
        key: 'tone',
        label: 'blocks.faq.fields.tone.fieldLabel',
        options: [
          { label: 'blocks.faq.fields.tone.options.info', value: 'info' },
        ],
      },
    ],
    ...overrides,
  };
}

function validCandidate(
  overrides: Partial<ThemeBlockCandidate> = {},
): ThemeBlockCandidate {
  return {
    basename: 'Faq',
    descriptor: validDescriptor(),
    hasRenderComponent: true,
    locales: {
      en: {
        label: 'FAQ',
        fields: {
          question: { fieldLabel: 'Question' },
          tone: { fieldLabel: 'Tone', options: { info: 'Info' } },
        },
      },
      it: {
        label: 'FAQ',
        fields: {
          question: { fieldLabel: 'Domanda' },
          tone: { fieldLabel: 'Tono', options: { info: 'Info' } },
        },
      },
    },
    ...overrides,
  };
}

describe('validateThemeBlockSet', () => {
  it('accepts a fully well-formed candidate', () => {
    expect(validateThemeBlockSet([validCandidate()])).toEqual([]);
  });

  it('rejects a filename that does not match the descriptor type', () => {
    const errors = validateThemeBlockSet([
      validCandidate({ basename: 'Wrong' }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        basename: 'Wrong',
        message: expect.stringContaining('must match its own type'),
      }),
    );
  });

  it('rejects a block with no matching .astro render component', () => {
    const errors = validateThemeBlockSet([
      validCandidate({ hasRenderComponent: false }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('no matching "Faq.astro"'),
      }),
    );
  });

  it('rejects an unknown category slug', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({ category: 'hero-section' }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('is not one of'),
      }),
    );
  });

  // Opened 2026-09-07: a descriptor now names its control instead of
  // holding a React component, so it crosses the wire like any other
  // field. What replaces the ban is a check on the NAME.
  it('accepts a field with kind:"custom" naming a control the editor has', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          fields: [
            {
              kind: 'custom',
              key: 'picker',
              label: 'blocks.faq.fields.picker.fieldLabel',
              control: 'media',
            },
          ],
        }),
      }),
    ]);
    // Only the field KIND is under test here — the fixture has no
    // translation for this key, and that error is a different rule's job.
    expect(
      errors.filter((error) => /custom|control/.test(error.message)),
    ).toEqual([]);
  });

  it('rejects a control the editor cannot render, naming it', () => {
    // Without this the field would render as a blank space under its
    // label — no error in the console, nothing in the build output.
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          fields: [
            {
              kind: 'custom',
              key: 'picker',
              label: 'blocks.faq.fields.picker.fieldLabel',
              control: 'spreadsheet' as never,
            },
          ],
        }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('spreadsheet'),
      }),
    );
  });

  it('rejects a descriptor label that does not match the derived i18n key — the exact Heading-style regression, one layer earlier', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({ label: 'blocks.faq.lable' }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: 'label "blocks.faq.lable" must be exactly "blocks.faq.label"',
      }),
    );
  });

  it('rejects a field label that does not match the derived i18n key', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          fields: [
            {
              kind: 'text',
              key: 'question',
              label: 'blocks.faq.fields.question.wrong',
            },
          ],
        }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          'field "question" label "blocks.faq.fields.question.wrong" must be exactly',
        ),
      }),
    );
  });

  it('rejects an option label that does not match the derived i18n key', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          fields: [
            {
              kind: 'select',
              key: 'tone',
              label: 'blocks.faq.fields.tone.fieldLabel',
              options: [
                {
                  label: 'blocks.faq.fields.tone.options.wrong',
                  value: 'info',
                },
              ],
            },
          ],
        }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          'option "info" label "blocks.faq.fields.tone.options.wrong" must be exactly',
        ),
      }),
    );
  });

  it('derives the expected key from the type with only the first character lowercased, matching multi-word core block keys (e.g. EmbedHtml -> blocks.embedHtml)', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        basename: 'StatusBadge',
        descriptor: validDescriptor({
          type: 'StatusBadge',
          label: 'blocks.statusbadge.label',
        }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message:
          'label "blocks.statusbadge.label" must be exactly "blocks.statusBadge.label"',
      }),
    );
  });

  it('rejects a missing locales.json', () => {
    const errors = validateThemeBlockSet([
      validCandidate({ locales: undefined }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('no matching "Faq.locales.json"'),
      }),
    );
  });

  it('rejects a locales.json missing one locale entirely', () => {
    const errors = validateThemeBlockSet([
      validCandidate({ locales: { en: validCandidate().locales?.en } }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: 'locales.json is missing "it"',
      }),
    );
  });

  it('rejects a locales.json missing a field label — the exact Heading-style regression this exists to catch', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        locales: {
          en: { label: 'FAQ', fields: {} },
          it: { label: 'FAQ', fields: {} },
        },
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('fields.question.fieldLabel'),
      }),
    );
  });

  it('rejects a locales.json missing a select option label', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        locales: {
          en: {
            label: 'FAQ',
            fields: {
              question: { fieldLabel: 'Q' },
              tone: { fieldLabel: 'Tone' },
            },
          },
          it: validCandidate().locales?.it,
        },
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('fields.tone.options.info'),
      }),
    );
  });

  it('rejects stylableProperties that do not exactly match defaultStyle keys', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          stylableProperties: ['backgroundColor', 'textColor'],
          defaultStyle: { backgroundColor: 'var(--background)' },
        }),
      }),
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('does not match defaultStyle keys'),
      }),
    );
  });

  it('accepts matching stylableProperties and defaultStyle', () => {
    const errors = validateThemeBlockSet([
      validCandidate({
        descriptor: validDescriptor({
          stylableProperties: ['backgroundColor', 'textColor'],
          defaultStyle: {
            backgroundColor: 'var(--background)',
            textColor: 'inherit',
          },
        }),
      }),
    ]);
    expect(errors).toEqual([]);
  });
});
