import { navBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { visibilityField } from '../fields/visibility-field';

export const navBlock = coreBlock(navBlockContract, {
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
});
