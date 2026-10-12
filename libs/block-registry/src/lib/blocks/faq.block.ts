import { faqBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * Questions and answers that search engines can read as such.
 *
 * Its items are the same `AccordionItem` an Accordion holds — a question
 * and an answer are the same thing in both. What a FAQ adds is the
 * schema.org `FAQPage` data, which is a claim about the page ("these are
 * its questions") that a plain accordion should not make.
 */
export const faqBlock = coreBlock(faqBlockContract, {
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
});
