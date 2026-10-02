import { z } from 'zod';

/**
 * A site's domain: a bare hostname, lowercase — no scheme, no port, no
 * path. The one rule that a domain typed in the editor is checked by and
 * that a Host header is checked by before it reaches a query.
 *
 * The API reads this one for a Host header and for a site's own `domain`
 * when it is saved: there is no second copy of the pattern to keep equal.
 */
export const siteDomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/,
    { message: 'domain must be a valid hostname' },
  );

/** Whether `value` is a domain the site can be served on. */
export function isSiteDomain(value: string): boolean {
  return siteDomainSchema.safeParse(value).success;
}
