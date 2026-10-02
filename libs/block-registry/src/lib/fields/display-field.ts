import type { FieldDescriptor } from '../field-types';

/**
 * Grid, slider or carousel (ADR-0052) — the arrangement every collection
 * offers, written out identically in six blocks before it was named here
 * (the same treatment `aspectRatioField` gives the picture's shape).
 *
 * Carousel keeps its own copy on purpose: it lists `carousel` first,
 * because that is what the block is named after and what it starts as.
 */
export const displayField: FieldDescriptor = {
  kind: 'select',
  key: 'display',
  label: 'blocks.shared.display.fieldLabel',
  options: [
    { label: 'blocks.shared.display.options.grid', value: 'grid' },
    { label: 'blocks.shared.display.options.slider', value: 'slider' },
    { label: 'blocks.shared.display.options.carousel', value: 'carousel' },
  ],
};
