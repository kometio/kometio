/**
 * What a preview token is allowed to unlock. A token is minted for one
 * kind and one id, and validation checks both — so a token for a section
 * cannot be replayed against a page.
 *
 * `section` is the reusable section of docs/adr/0059, previewed in its own
 * editor before it is published onto the pages that use it. The header
 * and footer have no preview of their own: their editor previews a page,
 * which draws them in their draft state.
 */
export type PreviewContentType = 'page' | 'section';
