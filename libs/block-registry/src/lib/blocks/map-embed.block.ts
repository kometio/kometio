import { mapEmbedBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const mapEmbedBlock = coreBlock(mapEmbedBlockContract, {
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
});
