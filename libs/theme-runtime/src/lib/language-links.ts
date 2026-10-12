import { localePathFromAncestors } from './locale-path';

/** One entry of a language switcher: where a visitor goes to read this page in `locale`. */
export interface LanguageLink {
  locale: string;
  href: string;
}

/** What `languageLinks` reads of a published translation of the page being shown. */
export interface LanguageLinkTranslation {
  locale: string;
  slug: string;
  ancestorSlugs: string[];
}

/** What `languageLinks` reads of the site. */
export interface LanguageLinkSite {
  defaultLocale: string;
  enabledLocales: string[];
  untranslatedPageFallback: string;
}

/**
 * One link per enabled locale that has somewhere to send the visitor: its
 * own translation of this page when it is published, otherwise the default
 * locale's page when the site is set to fall back to it
 * (`redirect-to-default`, docs/adr/0017). A locale with neither is left
 * out: there is nothing to link to.
 *
 * Core's `LanguageSwitcher` and a theme's restyle of it ask the same
 * question and differ only in how the answer looks, so it is asked here and
 * not copied into each: a theme that kept its own copy would go on linking
 * to a page that moved, or to one the site no longer falls back to.
 *
 * The path is the ancestor chain and not the bare slug: slugs are scoped to
 * their siblings (docs/adr/0029), so `/it/first-run` is not where a nested
 * page lives and linking there is a 404.
 */
export function languageLinks(
  site: LanguageLinkSite,
  translations: readonly LanguageLinkTranslation[],
): LanguageLink[] {
  const pathOf = (translation: LanguageLinkTranslation): string =>
    localePathFromAncestors(
      translation.locale,
      translation.ancestorSlugs,
      translation.slug,
    );
  // The default locale's translation doubles as the redirect target, the
  // same resolution PageLayout.astro's hreflang x-default alternate uses.
  const fallbackTarget =
    site.untranslatedPageFallback === 'redirect-to-default'
      ? translations.find(
          (translation) => translation.locale === site.defaultLocale,
        )
      : undefined;

  const links: LanguageLink[] = [];
  for (const locale of site.enabledLocales) {
    const own = translations.find(
      (translation) => translation.locale === locale,
    );
    const target = own ?? fallbackTarget;
    if (target) links.push({ locale, href: pathOf(target) });
  }
  return links;
}
