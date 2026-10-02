import type { StepsProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * How it works, in numbered steps. The numbers are counted by the page,
 * not typed: dragging the third step first renumbers everything.
 */
export const stepsBlock: BlockDescriptor<StepsProps> = {
  type: 'Steps',
  label: 'blocks.steps.label',
  category: 'content',
  icon: 'list-ordered',
  defaultProps: { orientation: 'horizontal' },
  fields: [
    {
      kind: 'radio',
      key: 'orientation',
      label: 'blocks.steps.fields.orientation.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.steps.fields.orientation.options.horizontal',
          value: 'horizontal',
        },
        {
          label: 'blocks.steps.fields.orientation.options.vertical',
          value: 'vertical',
        },
      ],
    },
  ],
  isContainer: true,
  allowedChildTypes: ['Step'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Steps,
};
