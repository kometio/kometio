import type { AccordionProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const accordionBlock: BlockDescriptor<AccordionProps> = {
  type: 'Accordion',
  label: 'blocks.accordion.label',
  category: 'interactive',
  icon: 'chevrons-up-down',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['AccordionItem'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Accordion,
};
