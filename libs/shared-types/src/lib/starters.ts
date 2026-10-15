/**
 * The starting points a new site is offered (docs/adr/0136), and the
 * languages they are written in. Here and not with the starters themselves
 * because the request that picks one and the screen that draws the choice
 * read these two lists, and neither may depend on the content.
 *
 * Tuples, with the types taken from them, so a list that is checked and a
 * list that is drawn cannot differ.
 */
export const STARTER_IDS = ['studio', 'portfolio', 'blog'] as const;
export type StarterId = (typeof STARTER_IDS)[number];

/**
 * Each is written for its language, not translated from the other: a
 * sentence that is natural in one is rarely the same sentence in the other.
 */
export const STARTER_LANGUAGES = ['it', 'en'] as const;
export type StarterLanguage = (typeof STARTER_LANGUAGES)[number];
