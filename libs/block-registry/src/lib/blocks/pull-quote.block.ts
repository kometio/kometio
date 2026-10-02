import type { PullQuoteProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { quoteBlock } from './quote.block';

/**
 * A sentence lifted out of an article and set large between rules. The
 * Quote block's fields, drawn by the Quote component — what it adds is
 * the emphasis, not a second way to write a quotation.
 */
export const pullQuoteBlock: BlockDescriptor<PullQuoteProps> = {
  type: 'PullQuote',
  label: 'blocks.pullQuote.label',
  category: 'content',
  icon: 'text-quote',
  defaultProps: { quote: '', author: '', role: '', align: 'center' },
  fields: [
    ...quoteBlock.fields,
    {
      kind: 'radio',
      key: 'align',
      label: 'blocks.shared.alignment.fieldLabel',
      group: 'style',
      options: [
        { label: 'blocks.shared.alignment.options.start', value: 'start' },
        { label: 'blocks.shared.alignment.options.center', value: 'center' },
      ],
    },
  ],
  // No radius: the quote is framed by a rule above and below, and a
  // site-wide radius (a theme sets one at :root) bent their ends.
  stylableProperties: ['backgroundColor', 'textColor', 'paddingX', 'paddingY'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.PullQuote,
};
