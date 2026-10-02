import { BLOCK_STYLE_DEFAULTS, type DividerProps } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

// No fields at all, and that is the design (ADR-0053): thickness, colour,
// style, width and the space around it are style properties already, per
// breakpoint. A `style` prop beside a `borderStyle` override would be the
// two-mechanisms mistake ADR-0050 found in Container.
export const dividerBlock: BlockDescriptor<DividerProps> = {
  type: 'Divider',
  label: 'blocks.divider.label',
  category: 'layout',
  icon: 'minus',
  defaultProps: {},
  fields: [],
  // No marginTop/marginBottom here: those two are instance-only and have
  // no theme default to resolve (see blockStyleOverrideSchema), so the
  // toolbar adds them for root-level blocks rather than the descriptor
  // declaring them — declaring them fails the BLOCK_STYLE_DEFAULTS
  // alignment invariant, which is how this was caught.
  stylableProperties: ['borderWidth', 'borderStyle', 'borderColor', 'maxWidth'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.Divider,
};
