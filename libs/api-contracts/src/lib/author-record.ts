import { z } from 'zod';
import { publishedPageSchema } from './published-page';
import { publicAuthorSchema } from '@kometio/shared-types';

/**
 * An author's own page, for the public read path — shaped exactly like a
 * page, as a term's is (ADR-0066), so it is drawn by the same component.
 */
export const publishedAuthorSchema = publishedPageSchema.extend({
  author: publicAuthorSchema,
});

export type PublishedAuthor = z.infer<typeof publishedAuthorSchema>;
