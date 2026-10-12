import { hamburgerMenuBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

// `position`/`visibility` instead of HamburgerMenuProps directly: at the
// domain level this block combines navItemPositionSchema (its position
// within the Nav) with its own visibility, exactly like
// hamburgerMenuPropsSchema in navigation-blocks.ts. Block.children is real, so
// no extra type is needed for it here.
export const hamburgerMenuBlock = coreBlock(hamburgerMenuBlockContract, {
  label: 'blocks.hamburgerMenu.label',
  category: 'navigation',
  icon: 'align-justify',
  defaultProps: { position: 'left', visibility: 'mobile-only' },
  fields: [positionField, visibilityField],
  isContainer: true,
  allowedChildTypes: ['NavLink', 'LanguageSwitcher'],
});
