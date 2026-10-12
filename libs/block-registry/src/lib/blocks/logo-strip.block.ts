import { logoStripBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

export const logoStripBlock = coreBlock(logoStripBlockContract, {
  label: 'blocks.logoStrip.label',
  category: 'media',
  icon: 'building-2',
  defaultProps: {
    logos: [],
  },
  fields: [
    FieldBuilder.custom(
      'logos',
      'blocks.logoStrip.fields.logos.fieldLabel',
      'gallery',
    ),
  ],
});
