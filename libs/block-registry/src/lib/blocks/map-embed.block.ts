import type { MapEmbedProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const mapEmbedBlock: BlockDescriptor<MapEmbedProps> = {
  type: 'MapEmbed',
  label: 'blocks.mapEmbed.label',
  category: 'media',
  icon: 'map-pin',
  defaultProps: {
    address: 'Via Roma 1, Milano',
  },
  fields: [
    // Not inlineEditable: the address is never a visible text node in
    // MapEmbed.astro — it only feeds the embedded map URL and the title
    // attribute of its iframe (ConsentGatedEmbed), never the rendered
    // DOM directly.
    {
      kind: 'text',
      key: 'address',
      label: 'blocks.mapEmbed.fields.address.fieldLabel',
    },
  ],
  stylableProperties: [
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'maxWidth',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.MapEmbed,
};
