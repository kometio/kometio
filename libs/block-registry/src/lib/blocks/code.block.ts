import type { CodeProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

// Short, curated list (not every language Shiki supports) — same reason
// as columns.block.ts's layout radio: a few clear options beat an
// exhaustive list in a content editor.
const LANGUAGE_OPTIONS = [
  'typescript',
  'tsx',
  'javascript',
  'bash',
  'json',
  'html',
  'css',
  'plaintext',
] as const;

export const codeBlock: BlockDescriptor<CodeProps> = {
  type: 'Code',
  label: 'blocks.code.label',
  category: 'content',
  icon: 'code',
  defaultProps: { code: '', language: 'typescript' },
  fields: [
    {
      kind: 'textarea',
      key: 'code',
      label: 'blocks.code.fields.code.fieldLabel',
      // Found live during the i18n backfill's round-trip verification
      // (not just theorized): real docs-showcase Code blocks often
      // contain human-language comments inside the snippet (e.g.
      // "# overrides Hero" / "# sovrascrive Hero") that had been
      // hand-translated per locale under the old duplicated-page model.
      // Marked translatable so that difference isn't silently lost: the
      // actual code still stays shared-by-default, the editor only
      // overrides when needed.
      translatable: true,
    },
    {
      kind: 'select',
      key: 'language',
      label: 'blocks.code.fields.language.fieldLabel',
      options: LANGUAGE_OPTIONS.map((value) => ({
        label: `blocks.code.fields.language.options.${value}`,
        value,
      })),
    },
  ],
  // No textColor: the Shiki theme (github-dark) already sets the syntax
  // colors, same reason as EmbedHtml for free-form content.
  stylableProperties: [
    'backgroundColor',
    'borderRadius',
    'paddingX',
    'paddingY',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Code,
};
