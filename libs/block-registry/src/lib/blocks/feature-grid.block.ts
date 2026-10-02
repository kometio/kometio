import type { FeatureGridProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

export const featureGridBlock: BlockDescriptor<FeatureGridProps> = {
  type: 'FeatureGrid',
  label: 'blocks.featureGrid.label',
  category: 'interactive',
  icon: 'grid-3x3',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['Feature'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.FeatureGrid,
};
