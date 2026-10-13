import { z } from 'zod';

/**
 * The two sections of the screen: the rules, and what visitors asked for and
 * the site did not have. In the address (`?tab=`), like a form's, so a link
 * can open the list of what was not found.
 */
export const REDIRECT_TABS = ['rules', 'missing'] as const;
export type RedirectTab = (typeof REDIRECT_TABS)[number];

/**
 * What the list of rules is narrowed to. One choice, not two filters: how a
 * rule came to be and whether it needs attention are both "which ones do I
 * want to look at", and a person asks it once.
 */
export const REDIRECT_FILTERS = [
  'all',
  'needs-target',
  'manual',
  'list',
  'wordpress',
] as const;
export type RedirectFilter = (typeof REDIRECT_FILTERS)[number];

// Optional at the type level for every plain <Link to="/settings/redirects">
// and a garbled value (?page=abc) falls back to the first page, as the
// other lists' schemas do. Its own module, read by the route and by the
// screen, so the two cannot disagree on what the address says.
export const redirectsSearchSchema = z.object({
  tab: z.enum(REDIRECT_TABS).default('rules').catch('rules'),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  q: z.string().trim().max(200).optional().catch(undefined),
  show: z.enum(REDIRECT_FILTERS).default('all').catch('all'),
});
export type RedirectsSearch = z.infer<typeof redirectsSearchSchema>;
