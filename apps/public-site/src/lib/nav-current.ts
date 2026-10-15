/**
 * Which of a menu's entries is the page being read, and which one is the
 * section it is in.
 *
 * A menu entry that did not say so left a reader of a screen reader without
 * the one thing a menu is for — where am I — and a theme without a way to
 * mark it. `aria-current="page"` is the standard answer for the entry that is
 * this page; `aria-current="location"` is the one for the entry whose section
 * this page belongs to (a project is in "Projects").
 *
 * Pure, and about addresses only: the entry's `href` as the link resolves it
 * and the address of the request.
 */
export type NavCurrent = 'page' | 'location' | null;

/** A path without its trailing slashes; the root is the empty string. */
function pathOf(url: URL): string {
  return url.pathname.replace(/\/+$/, '');
}

export function navCurrent(
  href: string | null | undefined,
  current: URL,
): NavCurrent {
  if (!href) return null;
  let target: URL;
  try {
    target = new URL(href, current);
  } catch {
    return null;
  }
  // Another site, or a mail address: never "here".
  if (target.origin !== current.origin) return null;

  const targetPath = pathOf(target);
  const currentPath = pathOf(current);
  if (targetPath === currentPath) return 'page';

  // A section, and only a real one: the root of a language (`/it`) is the
  // prefix of everything on the site, and marking it everywhere would
  // mark nothing.
  const segments = targetPath.split('/').filter(Boolean);
  if (segments.length >= 2 && currentPath.startsWith(`${targetPath}/`)) {
    return 'location';
  }
  return null;
}
