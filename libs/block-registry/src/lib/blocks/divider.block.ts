import { dividerBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

// No fields at all, and that is the design (ADR-0053): thickness, colour,
// style, width and the space around it are style properties already, per
// breakpoint. A `style` prop beside a `borderStyle` override would be the
// two-mechanisms mistake ADR-0050 found in Container.
export const dividerBlock = coreBlock(dividerBlockContract, {
  label: 'blocks.divider.label',
  category: 'layout',
  icon: 'minus',
  defaultProps: {},
  fields: [],
});
