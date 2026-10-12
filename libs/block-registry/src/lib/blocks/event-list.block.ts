import { eventListBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

/** What is on: dated events, as cards in a grid, a slider or a carousel. */
export const eventListBlock = coreBlock(eventListBlockContract, {
  label: 'blocks.eventList.label',
  category: 'localBusiness',
  icon: 'calendar-range',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['EventItem'],
});
