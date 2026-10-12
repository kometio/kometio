import { backToTopBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { visibilityField } from '../fields/visibility-field';

export const backToTopBlock = coreBlock(backToTopBlockContract, {
  label: 'blocks.backToTop.label',
  category: 'chrome',
  icon: 'arrow-up',
  defaultProps: { visibility: 'always' },
  fields: [visibilityField],
});
