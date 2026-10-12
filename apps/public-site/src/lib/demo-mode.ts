/**
 * Whether this deployment is a public demo (docs/adr/0118).
 *
 * Read at request time from `process.env`, like the API address and for the
 * same reason (public-api-client.ts): one built image serves whatever
 * deployment its environment says, so a value read at build time would be the
 * build machine's.
 *
 * What the site does differently in a demo is what only the site can do:
 * keep search engines out (the demo is a place to try, not a site to be
 * found), and not run what a visitor pasted into an embed — a block that runs
 * somebody's HTML, in a page at the demo's own address, is the one thing
 * the account everybody signs in with could otherwise put in front of
 * strangers.
 */
export function isDemoDeployment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env['KOMETIO_DEMO'] === 'true';
}
