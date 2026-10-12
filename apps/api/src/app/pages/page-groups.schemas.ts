import {
  createPageGroupBodyShape,
  saveDivergedPageTranslationContentBodyShape,
  savePageGroupContentBodyShape,
} from '@kometio/api-contracts';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';

/*
 * The three bodies of this module that carry block content, with the content
 * passed through the sanitiser (ADR-0046, ADR-0111): the shape is the
 * contract's, and what only a server does to it is added here. The other
 * bodies of the area are the contract's own.
 *
 * `safeExtend`, not `extend`: the first body has refinements (a template and
 * content are one or the other), which `extend` refuses to carry over.
 */

export const createPageGroupBodySchema = createPageGroupBodyShape.safeExtend({
  content: sanitizedPageContentSchema.optional(),
});

export const savePageGroupContentBodySchema =
  savePageGroupContentBodyShape.extend({
    content: sanitizedPageContentSchema,
  });

export const saveDivergedPageTranslationContentBodySchema =
  saveDivergedPageTranslationContentBodyShape.extend({
    content: sanitizedPageContentSchema,
  });
