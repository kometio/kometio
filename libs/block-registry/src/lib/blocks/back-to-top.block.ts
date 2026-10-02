import type { BackToTopProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { visibilityField } from '../fields/visibility-field';

export const backToTopBlock: BlockDescriptor<BackToTopProps> = {
  type: 'BackToTop',
  label: 'blocks.backToTop.label',
  category: 'chrome',
  icon: 'arrow-up',
  defaultProps: { visibility: 'always' },
  fields: [visibilityField],
  stylableProperties: [
    'backgroundColor',
    'textColor',
    'borderRadius',
    'boxShadow',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.BackToTop,
};
