import { openingHoursBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** The site's opening hours, from Business info — the same ones its structured data already declares. */
export const openingHoursBlock = coreBlock(openingHoursBlockContract, {
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
});
