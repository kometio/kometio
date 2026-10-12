import { accordionBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const accordionBlock = coreBlock(accordionBlockContract, {
  label: 'blocks.accordion.label',
  category: 'interactive',
  icon: 'chevrons-up-down',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['AccordionItem'],
});
