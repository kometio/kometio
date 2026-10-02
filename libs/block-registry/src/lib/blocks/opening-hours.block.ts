import type { OpeningHoursProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** The site's opening hours, from Business info — the same ones its structured data already declares. */
export const openingHoursBlock: BlockDescriptor<OpeningHoursProps> = {
  type: 'OpeningHours',
  label: 'blocks.openingHours.label',
  category: 'localBusiness',
  icon: 'clock',
  defaultProps: { title: '' },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.openingHours.fields.title.fieldLabel',
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.OpeningHours,
};
