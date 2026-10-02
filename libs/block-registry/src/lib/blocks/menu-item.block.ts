import type { MenuItemProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const menuItemBlock: BlockDescriptor<MenuItemProps> = {
  type: 'MenuItem',
  label: 'blocks.menuItem.label',
  category: 'localBusiness',
  icon: 'utensils',
  defaultProps: {
    name: '',
    description: '',
    price: '',
    dietary: '',
    allergens: '',
  },
  fields: [
    {
      kind: 'text',
      key: 'name',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.menuItem.fields.name.fieldLabel',
    },
    {
      kind: 'textarea',
      key: 'description',
      translatable: true,
      label: 'blocks.menuItem.fields.description.fieldLabel',
    },
    {
      kind: 'text',
      key: 'price',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.menuItem.fields.price.fieldLabel',
    },
    {
      kind: 'text',
      key: 'dietary',
      translatable: true,
      label: 'blocks.menuItem.fields.dietary.fieldLabel',
    },
    {
      kind: 'text',
      key: 'allergens',
      translatable: true,
      label: 'blocks.menuItem.fields.allergens.fieldLabel',
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.MenuItem,
};
