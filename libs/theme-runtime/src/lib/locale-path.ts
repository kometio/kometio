// The "home" slug is the well-known convention (predates multilingua) for
// "the page that answers a locale's own root" — `/it/` rather than a
// literal `/it/home`. Every other slug gets a plain `/{locale}/{slug}`.
// Shared by src/pages/[locale]/[slug].astro's sibling routes, sitemap.xml.ts,
// and (once built) the public-facing language switcher (docs/adr/0017) —
// one place computing "the real reachable URL for this locale/slug pair".
export function localePath(locale: string, slug: string): string {
  return slug === 'home' ? `/${locale}/` : `/${locale}/${slug}`;
}

// Deliberately a separate function rather than a new parameter on
// localePath(): only the catch-all route's canonical-redirect check and
// sitemap.xml.ts need a nested path today — NavLink, LanguageSwitcher and
// PageLayout's hreflang alternates still resolve a page by its own flat
// slug alone (see docs/adr for page hierarchy) and don't have an ancestor
// chain in hand, so their call sites are left untouched.
export function localePathFromAncestors(
  locale: string,
  ancestorSlugs: string[],
  slug: string,
): string {
  if (ancestorSlugs.length === 0) {
    return localePath(locale, slug);
  }
  return `/${locale}/${[...ancestorSlugs, slug].join('/')}`;
}

// RTL scripts in actual use across Kometio's realistic locale range — matched
// on the locale's base language subtag (`ar`/`ar-SA`/`ar-EG` all count),
// since locale-list-editor.tsx accepts any 2+ char string with no ISO
// validation (an agency's own naming convention is theirs to pick). Not
// exhaustive of every RTL script that exists, just the ones a real client
// site is plausible to need; add to this set if one comes up.
const RTL_LANGUAGE_SUBTAGS = new Set([
  'ar', // Arabic
  'he', // Hebrew
  'fa', // Persian/Farsi
  'ur', // Urdu
]);

// Feeds PageLayout.astro's <html dir=...> — the one place a locale's
// reading direction actually matters for rendering.
export function localeDirection(locale: string): 'ltr' | 'rtl' {
  const subtag = locale.split('-')[0]?.toLowerCase();
  return subtag !== undefined && RTL_LANGUAGE_SUBTAGS.has(subtag)
    ? 'rtl'
    : 'ltr';
}
