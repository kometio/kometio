// Mirrors @kometio/theme-runtime's locale-path.ts own convention (docs/adr/0017)
// — every locale gets a URL prefix, and "home" collapses to the bare
// locale root rather than a literal /home. Shared by page-editor-view.tsx
// (old Page model) and page-group-editor-view.tsx (PageGroup/
// PageTranslation) — both need the same public URL shape for their own
// "view page" link.
export function publicPagePath(locale: string, slug: string): string {
  return slug === 'home' ? `/${locale}/` : `/${locale}/${slug}`;
}
