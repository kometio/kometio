import type { UserRole } from '@kometio/domain-core';

/**
 * What a public demo does not do (docs/adr/0118).
 *
 * A demo is a deployment whose account everybody signs in with: its address
 * and password are on the page. So what that account can do has to be what
 * anybody may be left to do — and the roles of docs/roles.md already
 * say most of it. What is left is here: who is above a publisher, and the
 * few things a publisher may do that are not the demo's to give.
 */

/**
 * An admin is a publisher in a demo: nobody configures the site (its users,
 * its settings, its AI key, its themes, its imports and its archive are all
 * `configureSite`), whoever the account says it is.
 */
export function roleInDemo(role: UserRole): UserRole {
  return role === 'admin' ? 'publisher' : role;
}

/**
 * Whether a route is for nobody in a demo: the roles it allows, read as the
 * demo reads them, are none that exists there. Only an admin-only route is.
 */
export function isForAdminsOnly(
  requiredRoles: readonly string[] | undefined,
): boolean {
  return (
    requiredRoles !== undefined &&
    requiredRoles.length > 0 &&
    requiredRoles.every((role) => role === 'admin')
  );
}

interface Refusal {
  readonly methods: readonly string[];
  /**
   * The route as it was registered (`/api/forms/:id/submissions`), not the
   * address that was asked for. Express matches an address without regard to
   * case and with or without a final slash, so a pattern over the address
   * would have to guess every spelling that reaches a handler; the route is
   * one.
   */
  readonly route: RegExp;
  /** Why, for the people who read the code, not for the response. */
  readonly because: string;
}

/**
 * What a publisher may do and a demo does not take. Routes are as the API
 * registers them, under its `/api` prefix (which the integration specs, that
 * start the controllers without the prefix, do not have: it is optional).
 */
export const REFUSED_IN_DEMO: readonly Refusal[] = [
  {
    methods: ['POST'],
    route: /^(?:\/api)?\/media$/,
    because:
      'a file from anybody lands on the demo’s disk, under its owner’s name, at an address on the API’s domain',
  },
  {
    methods: ['POST', 'DELETE'],
    route: /^(?:\/api)?\/account\/avatar$/,
    because: 'an upload by another name',
  },
  {
    methods: ['POST'],
    route: /^(?:\/api)?\/public\/forms\/:[A-Za-z]+\/attachments$/,
    because: 'the same, from a visitor of the demo site with no account at all',
  },
  {
    methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
    route: /^(?:\/api)?\/account\/(?!language$)/,
    because:
      'the account is everybody’s: its password, its address and its profile are not one person’s to change (its language is a browser’s setting, and stays)',
  },
  {
    methods: ['GET'],
    route: /^(?:\/api)?\/forms\/:[A-Za-z]+\/submissions(?:\.csv)?$/,
    because:
      'what other visitors of the demo typed into its forms — a name, an address — would be read by whoever signs in next',
  },
];

export const NOT_IN_DEMO_MESSAGE = 'Not available in the demo';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a request is one the demo refuses outright. `route` is the
 * registered route that the request matched; a request that somehow arrives
 * without one is refused if it writes, and not otherwise.
 */
export function isRefusedInDemo(
  method: string,
  route: string | undefined,
): boolean {
  const upper = method.toUpperCase();
  if (route === undefined) return !READ_ONLY_METHODS.has(upper);
  return REFUSED_IN_DEMO.some(
    (refusal) => refusal.methods.includes(upper) && refusal.route.test(route),
  );
}
