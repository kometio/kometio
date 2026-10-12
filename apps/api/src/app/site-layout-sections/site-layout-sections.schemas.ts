import { saveSiteLayoutSectionDraftBodyShape } from '@kometio/api-contracts';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';

/*
 * The body of this module that carries block content, with the content
 * passed through the sanitiser (ADR-0046, ADR-0111). The other bodies of the
 * area are the contract's own.
 */
export const saveSiteLayoutSectionDraftBodySchema =
  saveSiteLayoutSectionDraftBodyShape.extend({
    content: sanitizedPageContentSchema,
  });
