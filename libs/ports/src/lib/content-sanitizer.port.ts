import type { Block, FieldValueOverlay } from '@kometio/shared-types';

/**
 * Makes what a person typed safe to put in a page. The one input a
 * request schema cannot clean on its own is a language's overlay: it names
 * a block by id, and only the page's own tree says what TYPE that block
 * is — which decides whether a value is rich text at all. Cleaning every
 * value would destroy `Code.code`, which is deliberately translatable.
 */
export interface ContentSanitizerPort {
  sanitizeFieldValueOverlay(
    fieldValues: FieldValueOverlay,
    groupContent: Block[],
  ): FieldValueOverlay;
}
