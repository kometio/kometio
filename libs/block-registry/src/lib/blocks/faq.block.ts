import type { FaqProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * Questions and answers that search engines can read as such.
 *
 * Its items are the same `AccordionItem` an Accordion holds — a question
 * and an answer are the same thing in both. What a FAQ adds is the
 * schema.org `FAQPage` data, which is a claim about the page ("these are
 * its questions") that a plain accordion should not make.
 */
export const faqBlock: BlockDescriptor<FaqProps> = {
  type: 'Faq',
  label: 'blocks.faq.label',
  category: 'interactive',
  icon: 'circle-help',
  defaultProps: { structuredData: true },
  fields: [
    {
      kind: 'boolean',
      key: 'structuredData',
      label: 'blocks.faq.fields.structuredData.fieldLabel',
      group: 'advanced',
    },
  ],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['AccordionItem'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Faq,
};
