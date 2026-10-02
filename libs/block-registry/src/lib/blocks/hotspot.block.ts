import type { HotspotProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

export const hotspotBlock: BlockDescriptor<HotspotProps> = {
  type: 'Hotspot',
  label: 'blocks.hotspot.label',
  category: 'media',
  icon: 'crosshair',
  defaultProps: { x: 50, y: 50, title: '', text: '' },
  fields: [
    {
      kind: 'number',
      key: 'x',
      min: 0,
      max: 100,
      step: 1,
      label: 'blocks.hotspot.fields.x.fieldLabel',
    },
    {
      kind: 'number',
      key: 'y',
      min: 0,
      max: 100,
      step: 1,
      label: 'blocks.hotspot.fields.y.fieldLabel',
    },
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.hotspot.fields.title.fieldLabel',
    },
    {
      kind: 'richtext',
      key: 'text',
      translatable: true,
      label: 'blocks.hotspot.fields.text.fieldLabel',
    },
  ],
  // Its title and text are not edited in place: they sit inside a closed
  // <details>, which the canvas keeps closed so a click selects the point.
  // A point placed in percent of a picture: without the picture there is
  // nothing for the percentages to be of.
  allowedParentTypes: ['ImageHotspots'],
  stylableProperties: ['backgroundColor', 'textColor'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Hotspot,
};
