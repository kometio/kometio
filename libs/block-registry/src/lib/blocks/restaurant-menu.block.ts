import type { RestaurantMenuProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * A menu: dishes, what is in them, what they cost. One section per block —
 * starters, mains, desserts are three menus under three headings, which
 * is how a page already says "this is a new part".
 */
export const restaurantMenuBlock: BlockDescriptor<RestaurantMenuProps> = {
  type: 'RestaurantMenu',
  label: 'blocks.restaurantMenu.label',
  category: 'localBusiness',
  icon: 'utensils-crossed',
  defaultProps: { columns: 'one' },
  fields: [
    {
      kind: 'radio',
      key: 'columns',
      label: 'blocks.restaurantMenu.fields.columns.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.restaurantMenu.fields.columns.options.one',
          value: 'one',
        },
        {
          label: 'blocks.restaurantMenu.fields.columns.options.two',
          value: 'two',
        },
      ],
    },
  ],
  isContainer: true,
  allowedChildTypes: ['MenuItem'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.RestaurantMenu,
};
