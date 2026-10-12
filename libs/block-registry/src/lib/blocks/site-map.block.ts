import { siteMapBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** Every published page, nested as the page tree nests them. */
export const siteMapBlock = coreBlock(siteMapBlockContract, {
  label: 'blocks.siteMap.label',
  category: 'content',
  icon: 'network',
  defaultProps: { depth: 3, tree: [] },
  fields: [
    {
      kind: 'number',
      key: 'depth',
      label: 'blocks.siteMap.fields.depth.fieldLabel',
      min: 1,
      max: 6,
    },
  ],
});
