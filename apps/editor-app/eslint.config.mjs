import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

/** A Tailwind class with a size in px/rem/em between brackets. */
const OFF_SCALE_SIZE = String.raw`/(^|\s)[a-z:-]*-\[-?[0-9.]+(px|rem|em)\]/`;
const OFF_SCALE =
  'A size off the spacing scale: use the scale (w-0.75, md:w-30) or a token (DESIGN.md).';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // The browser's own boxes speak the browser's language, ignore the
      // theme and lose what was typed: ConfirmActionDialog and
      // PromptDialog ask instead (DESIGN.md).
      'no-alert': 'error',
      // A date written by hand came out as 9/12/2026, which is a
      // different day in the next country: useFormatDate says it with the
      // month named, in the editor's language (DESIGN.md).
      'no-restricted-properties': [
        'error',
        ...['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].map(
          (property) => ({
            property,
            message:
              'Format dates with useFormatDate (lib/use-format-date.ts).',
          }),
        ),
        {
          object: 'Intl',
          property: 'DateTimeFormat',
          message: 'Format dates with useFormatDate (lib/use-format-date.ts).',
        },
      ],
    },
  },
  {
    files: ['**/src/lib/use-format-date.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Screens are built from the primitives in components/ui, which may
    // need what a screen may not: a size off the spacing scale
    // (`w-[3px]` has `w-0.75`, `md:w-[7.5rem]` has `md:w-30`), or a
    // <button> of their own.
    files: ['**/src/app/**/*.tsx'],
    // A test's harness is not a screen: a plain button is how it pokes one.
    ignores: ['**/*.spec.tsx'],
    rules: {
      // A screen draws no button by hand: forty-three did, in a dozen
      // paddings, most without a focus ring (DESIGN.md §4).
      'react/forbid-elements': [
        'error',
        {
          forbid: [
            {
              element: 'button',
              message:
                'Use Button, IconButton, ListItemButton, TileButton, ChoiceGroup or Tabs (components/ui, DESIGN.md).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${OFF_SCALE_SIZE}]`, message: OFF_SCALE },
        {
          selector: `TemplateElement[value.raw=${OFF_SCALE_SIZE}]`,
          message: OFF_SCALE,
        },
      ],
    },
  },
];
