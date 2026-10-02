import type { ListItemProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const listItemBlock: BlockDescriptor<ListItemProps> = {
  type: 'ListItem',
  label: 'blocks.listItem.label',
  category: 'content',
  icon: 'dot',
  defaultProps: { text: '' },
  fields: [
    {
      kind: 'richtext',
      key: 'text',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.listItem.fields.text.fieldLabel',
    },
  ],
  allowedParentTypes: ['List'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.ListItem,
};
