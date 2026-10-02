import { BLOCK_STYLE_DEFAULTS, type IconProps } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

export const iconBlock: BlockDescriptor<IconProps> = {
  type: 'Icon',
  label: 'blocks.icon.label',
  category: 'content',
  icon: 'smile',
  defaultProps: { icon: null, size: 'md', label: '' },
  fields: [
    FieldBuilder.custom('icon', 'blocks.icon.fields.icon.fieldLabel', 'icon'),
    {
      kind: 'radio',
      key: 'size',
      label: 'blocks.icon.fields.size.fieldLabel',
      options: [
        { label: 'blocks.icon.fields.size.options.sm', value: 'sm' },
        { label: 'blocks.icon.fields.size.options.md', value: 'md' },
        { label: 'blocks.icon.fields.size.options.lg', value: 'lg' },
        { label: 'blocks.icon.fields.size.options.xl', value: 'xl' },
      ],
    },
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.icon.fields.label.fieldLabel',
      // Empty on purpose by default: most icons sit beside text that
      // already says the same thing, and announcing them twice is worse
      // than not announcing them. Filling this in makes the icon content.
      placeholder: '',
    },
  ],
  stylableProperties: ['textColor'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Icon,
};
