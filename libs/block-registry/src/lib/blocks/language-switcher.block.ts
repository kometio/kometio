import { languageSwitcherBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

export const languageSwitcherBlock = coreBlock(languageSwitcherBlockContract, {
  label: 'blocks.languageSwitcher.label',
  category: 'navigation',
  icon: 'languages',
  defaultProps: { position: 'left', visibility: 'always' },
  fields: [positionField, visibilityField],
});
