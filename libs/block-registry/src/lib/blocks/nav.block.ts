import type { NavProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { visibilityField } from '../fields/visibility-field';

export const navBlock: BlockDescriptor<NavProps> = {
  type: 'Nav',
  label: 'blocks.nav.label',
  category: 'navigation',
  icon: 'menu',
  defaultProps: { visibility: 'always' },
  fields: [visibilityField],
  isContainer: true,
  allowedChildTypes: [
    'NavLink',
    'LanguageSwitcher',
    'HamburgerMenu',
    'NavDropdown',
  ],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Nav,
};
