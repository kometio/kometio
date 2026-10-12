import type { SeoMeta } from '@kometio/shared-types';
import type {
  PublishedPageTranslation,
  PublishedSite,
} from '@kometio/api-contracts';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import { buildSchemaOrgGraph } from './schema-org';

export interface PageSeoInput {
  seoMeta: SeoMeta;
  locale: string;
  translations: PublishedPageTranslation[];
  site: PublishedSite;
  /** `Astro.url.origin`. */
  origin: string;
  /** `Astro.url.href`, the last resort for a canonical. */
  href: string;
}

/** What a page tells a search engine about itself, as the layout's `<head>` writes it. */
export interface PageSeo {
  canonicalUrl: string;
  /** `og:url`: always the canonical. */
  pageUrl: string;
  ogImage: string | undefined;
  /** One `hreflang` alternate per published translation, itself included. */
  alternates: { locale: string; href: string }[];
  /** The default locale's translation, if published, as `x-default`. */
  xDefaultHref: string | undefined;
  /** The schema.org graph, already safe to write inside a `<script>`. */
  schemaOrgJson: string;
}

/**
 * The page's canonical address, its alternates and its structured data.
 *
 * Moved out of PageLayout.astro as it was: it is pure, and nothing tested it
 * while it was part of a template.
 */
export function resolvePageSeo({
  seoMeta,
  locale,
  translations,
  site,
  origin,
  href,
}: PageSeoInput): PageSeo {
  // The default locale's translation, if published, doubles as the
  // x-default alternate (docs/adr/0017) — the version search engines should
  // offer a visitor whose browser locale matches none of the site's.
  const defaultTranslation = translations.find(
    (translation) => translation.locale === site.defaultLocale,
  );

  // seoMeta.canonical is the source of truth when set (docs/adr/0014's SEO
  // panel lets an editor override it).
  //
  // Otherwise the page's own address, BUILT rather than taken from
  // `href`: that carries whatever the visitor arrived with —
  // `?utm_source=…`, a stray `?page=2` — and a canonical that varies with
  // the query string is not a canonical at all, it just tells a search
  // engine every tagged link is its own page. Building it from the
  // translation also means it is the reachable, nested address and not the
  // bare slug.
  //
  // `href` stays as the last resort for the case that should not
  // happen (a rendered page with no translation in its own locale), because
  // a wrong canonical is still better than none at all.
  const currentTranslation = translations.find(
    (translation) => translation.locale === locale,
  );
  const canonicalUrl =
    seoMeta.canonical ||
    (currentTranslation
      ? `${origin}${localePathFromAncestors(currentTranslation.locale, currentTranslation.ancestorSlugs, currentTranslation.slug)}`
      : href);
  // og:url and the canonical must agree — two different "this page's
  // address" in the same document is a contradiction crawlers resolve
  // unpredictably.
  const pageUrl = canonicalUrl;
  const ogImage = seoMeta.ogTags?.['image'];
  const schemaOrgGraph = buildSchemaOrgGraph({ site, seoMeta, pageUrl });
  // JSON.stringify doesn't escape "<" — a "</script>" inside any string value
  // (e.g. a site name an admin typed) would otherwise break out of this tag.
  // The safety concern is about embedding JSON.stringify's output as raw
  // script content, not the SEO/business data itself, so it lives here at the
  // embedding point rather than in schema-org.ts's own (pure, testable) logic.
  const schemaOrgJson = JSON.stringify(schemaOrgGraph).replace(/</g, '\\u003c');

  const addressOf = (translation: PublishedPageTranslation): string =>
    `${origin}${localePathFromAncestors(translation.locale, translation.ancestorSlugs, translation.slug)}`;

  return {
    canonicalUrl,
    pageUrl,
    ogImage,
    alternates: translations.map((translation) => ({
      locale: translation.locale,
      href: addressOf(translation),
    })),
    xDefaultHref: defaultTranslation
      ? addressOf(defaultTranslation)
      : undefined,
    schemaOrgJson,
  };
}
