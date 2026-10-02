import type { MarqueeProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * Anything, scrolling sideways without end — a row of logos, a line of
 * text. The generic container the hundred-blocks plan named next to
 * Slider and Carousel.
 */
export const marqueeBlock: BlockDescriptor<MarqueeProps> = {
  type: 'Marquee',
  label: 'blocks.marquee.label',
  category: 'interactive',
  icon: 'infinity',
  defaultProps: { speed: 'normal', direction: 'forward', pauseOnHover: true },
  fields: [
    {
      kind: 'radio',
      key: 'speed',
      label: 'blocks.marquee.fields.speed.fieldLabel',
      options: [
        { label: 'blocks.marquee.fields.speed.options.slow', value: 'slow' },
        {
          label: 'blocks.marquee.fields.speed.options.normal',
          value: 'normal',
        },
        { label: 'blocks.marquee.fields.speed.options.fast', value: 'fast' },
      ],
    },
    {
      kind: 'radio',
      key: 'direction',
      label: 'blocks.marquee.fields.direction.fieldLabel',
      options: [
        {
          label: 'blocks.marquee.fields.direction.options.forward',
          value: 'forward',
        },
        {
          label: 'blocks.marquee.fields.direction.options.backward',
          value: 'backward',
        },
      ],
    },
    {
      kind: 'boolean',
      key: 'pauseOnHover',
      label: 'blocks.marquee.fields.pauseOnHover.fieldLabel',
    },
  ],
  isContainer: true,
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Marquee,
};
