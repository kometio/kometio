import type { FieldDescriptor } from '../field-types';

/**
 * Shared by every block that has a `NavItemPosition` prop (NavLink,
 * LanguageSwitcher, HamburgerMenu, NavDropdown) so the options aren't
 * duplicated per block — see navItemPositionSchema in
 * @kometio/shared-types for what "left"/"right" mean at render time.
 */
export const positionField: FieldDescriptor = {
  kind: 'radio',
  key: 'position',
  label: 'blocks.shared.position.fieldLabel',
  options: [
    { label: 'blocks.shared.position.options.left', value: 'left' },
    { label: 'blocks.shared.position.options.right', value: 'right' },
  ],
};
