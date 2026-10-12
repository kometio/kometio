import { readingProgressBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** A thin bar that fills as the page is read. Its colour is the block's background. */
export const readingProgressBlock = coreBlock(readingProgressBlockContract, {
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
});
