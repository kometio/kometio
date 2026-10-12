import { pullQuoteBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { quoteBlock } from './quote.block';

/**
 * A sentence lifted out of an article and set large between rules. The
 * Quote block's fields, drawn by the Quote component — what it adds is
 * the emphasis, not a second way to write a quotation.
 */
export const pullQuoteBlock = coreBlock(pullQuoteBlockContract, {
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
});
