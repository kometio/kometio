import type { BookingEmbedProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

/**
 * A booking page from Calendly, Cal.com or Google Calendar, on this page.
 *
 * Behind the same click-to-load gate as a video (ConsentGatedEmbed): the
 * booking service sets its own cookies, and nothing of it loads until the
 * visitor asks for it.
 */
export const bookingEmbedBlock: BlockDescriptor<BookingEmbedProps> = {
  type: 'BookingEmbed',
  label: 'blocks.bookingEmbed.label',
  category: 'media',
  icon: 'calendar-check',
  defaultProps: { provider: 'calendly', url: '', height: 'medium' },
  fields: [
    {
      kind: 'radio',
      key: 'provider',
      label: 'blocks.bookingEmbed.fields.provider.fieldLabel',
      options: [
        {
          label: 'blocks.bookingEmbed.fields.provider.options.calendly',
          value: 'calendly',
        },
        {
          label: 'blocks.bookingEmbed.fields.provider.options.calcom',
          value: 'calcom',
        },
        {
          label: 'blocks.bookingEmbed.fields.provider.options.google',
          value: 'google',
        },
      ],
    },
    {
      kind: 'text',
      key: 'url',
      required: true,
      translatable: true,
      label: 'blocks.bookingEmbed.fields.url.fieldLabel',
    },
    {
      kind: 'radio',
      key: 'height',
      label: 'blocks.bookingEmbed.fields.height.fieldLabel',
      group: 'style',
      options: [
        {
          label: 'blocks.bookingEmbed.fields.height.options.short',
          value: 'short',
        },
        {
          label: 'blocks.bookingEmbed.fields.height.options.medium',
          value: 'medium',
        },
        {
          label: 'blocks.bookingEmbed.fields.height.options.tall',
          value: 'tall',
        },
      ],
    },
  ],
  stylableProperties: [
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'maxWidth',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.BookingEmbed,
};
