/**
 * Where a form or newsletter proxy sends the visitor after a POST: back
 * to the page the form was on (`_redirectTo`), with a flag in the query
 * the page reads to show the result.
 *
 * `_redirectTo` is a field of the posted form, so anyone can put anything
 * there. It is kept only when it is a path on this same site: a value like
 * `/.//evil.com` used to come out as `Location: //evil.com`, which a
 * browser follows to another domain. Anything else lands on the home page.
 */
export function backToPage(
  redirectTo: string,
  requestUrl: string,
  flag: { name: string; value: string },
): string {
  const here = new URL(requestUrl);
  let target = new URL(redirectTo, here);
  if (target.origin !== here.origin || target.pathname.startsWith('//')) {
    target = new URL('/', here);
  }
  target.searchParams.set(flag.name, flag.value);
  return target.pathname + target.search;
}
