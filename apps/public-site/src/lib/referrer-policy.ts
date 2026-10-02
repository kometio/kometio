/**
 * What a page tells the sites it links to about itself. A preview's
 * address carries its token (`?token=`), so a preview tells nobody
 * anything; every other page says only which site the visitor came from,
 * the browsers' own default, now stated rather than assumed.
 */
export function referrerPolicyFor(pathname: string): string {
  return pathname.startsWith('/preview/')
    ? 'no-referrer'
    : 'strict-origin-when-cross-origin';
}
