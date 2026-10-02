import {
  BLOCK_STYLE_DEFAULTS,
  type CarouselProps,
} from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

// Named Carousel rather than Slider, and not for taste: `ImageSlider`
// already owns the `.kometio-slider` class that `blockTypeToClassName`
// derives from a type, and two blocks cannot share one. The collision was
// invisible while this block was unreachable — `container-type.spec.ts`
// named it the moment it became insertable (ADR-0055).
//
// No allowedChildTypes — the point of this block is that it holds
// anything, the same reasoning as Container and Column. A collection with
// a fixed child type answers the other half of the need (ADR-0052).
export const carouselBlock: BlockDescriptor<CarouselProps> = {
  type: 'Carousel',
  label: 'blocks.carousel.label',
  category: 'layout',
  icon: 'gallery-horizontal',
  defaultProps: { display: 'carousel' },
  fields: [
    {
      kind: 'select',
      key: 'display',
      label: 'blocks.shared.display.fieldLabel',
      options: [
        { label: 'blocks.shared.display.options.carousel', value: 'carousel' },
        { label: 'blocks.shared.display.options.slider', value: 'slider' },
        { label: 'blocks.shared.display.options.grid', value: 'grid' },
      ],
    },
  ],
  isContainer: true,
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Carousel,
};
