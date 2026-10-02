import type { NavDropdownProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { positionField } from '../fields/position-field';
import { visibilityField } from '../fields/visibility-field';

export const navDropdownBlock: BlockDescriptor<NavDropdownProps> = {
  type: 'NavDropdown',
  label: 'blocks.navDropdown.label',
  category: 'navigation',
  icon: 'chevron-down-square',
  defaultProps: {
    label: 'Sottomenu',
    position: 'left',
    visibility: 'always',
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.navDropdown.fields.label.fieldLabel',
      inlineEditable: true,
    },
    positionField,
    visibilityField,
  ],
  // Capped at one level (docs/adr/0018 follow-up): only NavLink, not
  // another NavDropdown.
  isContainer: true,
  allowedChildTypes: ['NavLink'],
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'gap',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.NavDropdown,
};
