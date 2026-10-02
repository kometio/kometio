import type { UserRole } from './author';

/**
 * Who may do what — the one table the API guards its routes with and the
 * editor shows its buttons by, so the two cannot disagree (docs/roles.md).
 *
 * - `editDrafts`: write what nobody sees until it is published — a page's
 *   blocks and texts, versions, previews, new pages and translations,
 *   templates, reusable sections' drafts, media.
 * - `changeLiveSite`: publish, and every change that shows online without
 *   a publish — a page's SEO, address, place in the tree, order,
 *   collection and terms; the header's stickiness; a section's exposed
 *   fields; forms (they have no draft); collections, taxonomies and
 *   terms.
 * - `delete`: remove anything.
 * - `configureSite`: the site's own settings, its users, AI, themes and
 *   imports.
 */
export const PERMISSIONS = {
  editDrafts: ['admin', 'publisher', 'editor'],
  changeLiveSite: ['admin', 'publisher'],
  delete: ['admin', 'publisher'],
  configureSite: ['admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Whether this role may; nobody may while the role is not known yet. */
export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  const allowed: readonly UserRole[] = PERMISSIONS[permission];
  return allowed.includes(role);
}
