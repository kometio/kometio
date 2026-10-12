import { eventItemBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';
import { ctaLinkFields } from '../fields/link-type-field';

/**
 * One event: when, where, what. It stops showing once it is over, unless
 * somebody wants an archive — an invitation to last Saturday's concert is
 * a mistake a visitor notices before the owner does.
 */
export const eventItemBlock = coreBlock(eventItemBlockContract, {
  label: 'blocks.eventItem.label',
  category: 'localBusiness',
  icon: 'calendar-clock',
  defaultProps: {
    title: '',
    startDate: '',
    startTime: '',
    endDate: '',
    location: '',
    description: '',
    image: null,
    linkType: 'url',
    page: null,
    url: '',
    hideWhenPast: true,
    structuredData: true,
  },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.eventItem.fields.title.fieldLabel',
    },
    FieldBuilder.custom(
      'startDate',
      'blocks.eventItem.fields.startDate.fieldLabel',
      'date',
      { required: true },
    ),
    FieldBuilder.custom(
      'startTime',
      'blocks.eventItem.fields.startTime.fieldLabel',
      'time',
    ),
    FieldBuilder.custom(
      'endDate',
      'blocks.eventItem.fields.endDate.fieldLabel',
      'date',
    ),
    {
      kind: 'text',
      key: 'location',
      translatable: true,
      label: 'blocks.eventItem.fields.location.fieldLabel',
    },
    {
      kind: 'richtext',
      key: 'description',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.eventItem.fields.description.fieldLabel',
    },
    FieldBuilder.custom(
      'image',
      'blocks.eventItem.fields.image.fieldLabel',
      'media',
    ),
    ...ctaLinkFields({ required: false }),
    {
      kind: 'boolean',
      key: 'hideWhenPast',
      label: 'blocks.eventItem.fields.hideWhenPast.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'structuredData',
      label: 'blocks.eventItem.fields.structuredData.fieldLabel',
      group: 'advanced',
    },
  ],
});
