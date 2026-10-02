import type { SiteMapProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** Every published page, nested as the page tree nests them. */
export const siteMapBlock: BlockDescriptor<SiteMapProps> = {
  type: 'SiteMap',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.SiteMap,
};
