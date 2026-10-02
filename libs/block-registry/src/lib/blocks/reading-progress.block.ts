import type { ReadingProgressProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

/** A thin bar that fills as the page is read. Its colour is the block's background. */
export const readingProgressBlock: BlockDescriptor<ReadingProgressProps> = {
  type: 'ReadingProgress',
  label: 'blocks.readingProgress.label',
  category: 'interactive',
  icon: 'book-open-check',
  defaultProps: { position: 'top' },
  fields: [
    {
      kind: 'radio',
      key: 'position',
      label: 'blocks.readingProgress.fields.position.fieldLabel',
      options: [
        {
          label: 'blocks.readingProgress.fields.position.options.top',
          value: 'top',
        },
        {
          label: 'blocks.readingProgress.fields.position.options.bottom',
          value: 'bottom',
        },
      ],
    },
  ],
  stylableProperties: ['backgroundColor', 'minHeight'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ReadingProgress,
};
