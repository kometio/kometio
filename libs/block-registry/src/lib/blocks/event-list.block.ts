import type { EventListProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

/** What is on: dated events, as cards in a grid, a slider or a carousel. */
export const eventListBlock: BlockDescriptor<EventListProps> = {
  type: 'EventList',
  label: 'blocks.eventList.label',
  category: 'localBusiness',
  icon: 'calendar-range',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['EventItem'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.EventList,
};
