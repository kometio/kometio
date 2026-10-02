import type { ReactNode } from 'react';

/**
 * A stand-in for TanStack Router's `Link`, for specs that render one
 * component rather than a route.
 *
 * `Link` calls `useLinkProps`, which needs a real router context — there
 * is none in a component-only render, and the component throws. Specs
 * used to write their own copy of this; the copies differed in small ways
 * (one built `params` into the wrong path, two handled `search`, most
 * handled neither), which is exactly how a duplicated helper goes wrong.
 * admin-shell.spec.tsx keeps its own on purpose: it plays the router's
 * "this link is the current page" state, which a shared stub cannot know.
 *
 * Used from inside a `vi.mock` factory, which is hoisted above the
 * imports and so cannot close over one:
 *
 * ```ts
 * vi.mock('@tanstack/react-router', async (importOriginal) => ({
 *   ...(await importOriginal<typeof import('@tanstack/react-router')>()),
 *   Link: (await import('../test/router-link.test-fixture')).StubLink,
 * }));
 * ```
 */
export function StubLink({
  children,
  to,
  params,
  search,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  to: string;
  /** `/page-groups/$groupId` + `{ groupId: 'g1' }` renders as `/page-groups/g1`, so a spec can assert on the href it would really produce. */
  params?: Record<string, string>;
  /** `{ page: 1, kind: 'image' }` renders as `?page=1&kind=image`, in the order given; an `undefined` value is left out, as the router leaves it out. */
  search?: Record<string, string | number | boolean | undefined>;
  className?: string;
  /** A link whose name says more than its text: the router passes it through to the anchor, and so does this. */
  'aria-label'?: string;
}) {
  const path = Object.entries(params ?? {}).reduce(
    (built, [name, value]) => built.replace(`$${name}`, value),
    to,
  );
  const query = new URLSearchParams(
    Object.entries(search ?? {}).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, String(value)]],
    ),
  ).toString();
  const href = query ? `${path}?${query}` : path;
  return (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
