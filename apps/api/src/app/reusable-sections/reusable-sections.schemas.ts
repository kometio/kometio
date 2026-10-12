import {
  createReusableSectionBodyShape,
  saveReusableSectionDraftBodyShape,
} from '@kometio/api-contracts';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';

/*
 * The two bodies of this module that carry block content, with the content
 * passed through the sanitiser (ADR-0046, ADR-0111): the shape is the
 * contract's, and what only a server does to it is added here. The other
 * bodies of the area are the contract's own.
 */

export const createReusableSectionBodySchema =
  createReusableSectionBodyShape.extend({
    content: sanitizedPageContentSchema.optional(),
  });

export const saveReusableSectionDraftBodySchema =
  saveReusableSectionDraftBodyShape.extend({
    content: sanitizedPageContentSchema,
  });
