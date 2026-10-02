import type { ContainerProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const containerBlock: BlockDescriptor<ContainerProps> = {
  type: 'Container',
  label: 'blocks.container.label',
  category: 'layout',
  icon: 'square',
  defaultProps: { background: 'none', padding: 'md' },
  fields: [
    {
      kind: 'radio',
      key: 'background',
      label: 'blocks.container.fields.background.fieldLabel',
      options: [
        {
          label: 'blocks.container.fields.background.options.none',
          value: 'none',
        },
        {
          label: 'blocks.container.fields.background.options.muted',
          value: 'muted',
        },
        {
          label: 'blocks.container.fields.background.options.primary',
          value: 'primary',
        },
        {
          label: 'blocks.container.fields.background.options.secondary',
          value: 'secondary',
        },
      ],
    },
    {
      kind: 'radio',
      key: 'padding',
      label: 'blocks.container.fields.padding.fieldLabel',
      options: [
        {
          label: 'blocks.container.fields.padding.options.none',
          value: 'none',
        },
        {
          label: 'blocks.container.fields.padding.options.sm',
          value: 'sm',
        },
        {
          label: 'blocks.container.fields.padding.options.md',
          value: 'md',
        },
        {
          label: 'blocks.container.fields.padding.options.lg',
          value: 'lg',
        },
      ],
    },
  ],
  // No allowedChildTypes — unlike Column (a fixed list for a grid
  // track), a Container is meant to hold anything, including another
  // Container or Columns.
  isContainer: true,
  // background/padding are in this list now (ADR-0050). They used to be
  // left out to avoid "two mechanisms for the same property" — but the
  // preset and the override were never two mechanisms, they were one
  // declaration and a Tailwind class that always beat it. The preset is
  // the fallback of the override now, so setting either does what it
  // says, and setting the free value wins.
  stylableProperties: [
    'backgroundColor',
    'paddingX',
    'paddingY',
    'flexDirection',
    'textColor',
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'backgroundImage',
    'backgroundPosition',
    'backgroundSize',
    'backgroundRepeat',
    'overlayColor',
    'minHeight',
    'maxWidth',
    'gap',
    'contentAlign',
    'contentJustify',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Container,
};
