import { buttonBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';

export const buttonBlock = coreBlock(buttonBlockContract, {
  label: 'blocks.button.label',
  category: 'conversion',
  icon: 'mouse-pointer-click',
  defaultProps: {
    label: 'Scopri di più',
    linkType: 'page',
    page: null,
    url: '',
    icon: null,
    size: 'md',
    fullWidth: false,
    openInNewTab: false,
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.button.fields.label.fieldLabel',
      inlineEditable: true,
    },
    ...ctaLinkFields(),
    FieldBuilder.custom('icon', 'blocks.button.fields.icon.fieldLabel', 'icon'),
    {
      kind: 'radio',
      key: 'size',
      label: 'blocks.button.fields.size.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.button.fields.size.options.sm', value: 'sm' },
        { label: 'blocks.button.fields.size.options.md', value: 'md' },
        { label: 'blocks.button.fields.size.options.lg', value: 'lg' },
      ],
    },
    {
      kind: 'boolean',
      key: 'fullWidth',
      label: 'blocks.button.fields.fullWidth.fieldLabel',
      group: 'style',
    },
    {
      kind: 'boolean',
      key: 'openInNewTab',
      label: 'blocks.button.fields.openInNewTab.fieldLabel',
      group: 'advanced',
    },
  ],
  // Was a `kind: 'radio'` prop until ADR-0047. It is the same two looks,
  // declared where a look belongs: `Block.variant` rather than the block's
  // content, so a theme can add a third without editing anyone's pages.
  variants: [
    { value: 'secondary', label: 'blocks.button.variants.secondary' },
    // The three every design system ships (ADR-0056). `link` deliberately
    // stops reading as a button, which is what it is for.
    { value: 'outline', label: 'blocks.button.variants.outline' },
    { value: 'ghost', label: 'blocks.button.variants.ghost' },
    { value: 'link', label: 'blocks.button.variants.link' },
  ],
});
