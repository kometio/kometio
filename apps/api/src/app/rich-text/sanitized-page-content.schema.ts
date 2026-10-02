import { pageContentSchema } from '@kometio/shared-types';
import { sanitizePageContent } from './sanitize-page-content';

/**
 * `pageContentSchema`, but the content that comes out the other side has
 * already had every rich text value sanitised.
 *
 * Deliberately a schema rather than a call inside each controller method.
 * ADR-0046 asks for "everything that enters the database is already
 * safe", and notes that a contract with an unguarded entrance is not one
 * — so the guard sits on the thing every entrance already has to use to
 * accept content at all. A new write path gets it by writing the code
 * that made it work; there is nothing to remember.
 *
 * `sanitized-page-content.schema.spec.ts` walks every exported schema in
 * the API that accepts block content and fails if one of them lets a
 * `<script>` through, so a path built on the raw schema instead cannot
 * pass unnoticed.
 */
export const sanitizedPageContentSchema =
  pageContentSchema.transform(sanitizePageContent);
