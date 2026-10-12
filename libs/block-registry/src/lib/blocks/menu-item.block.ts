import { menuItemBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const menuItemBlock = coreBlock(menuItemBlockContract, {
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
});
