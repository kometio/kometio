import type { LanguageSwitcherProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

export const languageSwitcherBlock: BlockDescriptor<LanguageSwitcherProps> = {
  type: 'LanguageSwitcher',
  label: 'blocks.languageSwitcher.label',
  category: 'navigation',
  icon: 'languages',
  defaultProps: { position: 'left', visibility: 'always' },
  fields: [positionField, visibilityField],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.LanguageSwitcher,
};
