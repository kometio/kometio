import type { PageContent, SeoMeta } from '@kometio/shared-types';
import type { PublishedTerm } from '@kometio/api-contracts';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SiteLayoutSectionRepositoryPort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import type { Taxonomy, Term } from '@kometio/domain-core';
import { resolveSiteChrome } from './resolve-site-chrome';
import { resolvePageContent } from './resolve-page-content-references';

export interface GetPublishedTermByPathDeps {
  siteRepository: SiteRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
}

export interface GetPublishedTermByPathInput {
  tenantId: string;
  domain: string;
  locale: string;
  /** The URL path after the locale, e.g. ['categoria', 'espresso'] — or one segment for a root-mounted dimension. */
  segments: string[];
}

/**
 * A term's own page (docs/adr/0064), for the public, unauthenticated
 * read path.
 *
 * Called only after the page lookup has failed: a page always wins, and
 * that ordering is what makes the collision checks in the write path a
 * belt rather than the only rule. What comes back is shaped exactly like
 * a page, so apps/public-site renders it through the same component with
 * the same chrome, the same instance styles and the same blocks.
 *
 * The hand-built landing page, when there is one, is rendered ON this
 * address rather than redirected to — so unlinking or deleting it
 * changes what is drawn and never whether the address answers.
 */
export async function getPublishedTermByPath(
  deps: GetPublishedTermByPathDeps,
  input: GetPublishedTermByPathInput,
): Promise<PublishedTerm | null> {
  // One or two segments, and nothing else: a term's address is
  // `{prefix}/{slug}` or `{slug}`, flat by design — the ancestors are not
  // in the path, which is what makes re-filing a term safe.
  const [first, second] = input.segments;
  if (first === undefined || input.segments.length > 2) {
    return null;
  }
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }

  const [prefix, slug] = second === undefined ? [null, first] : [first, second];

  const term = await deps.taxonomyRepository.findTermByAddress(
    input.tenantId,
    site.id,
    input.locale,
    prefix,
    slug,
  );
  if (!term) {
    return null;
  }
  const taxonomy = await deps.taxonomyRepository.findTaxonomyById(
    input.tenantId,
    term.taxonomyId,
  );
  if (!taxonomy) {
    return null;
  }

  // The landing page's own translation, not just its blocks: a form on a
  // hand-built term landing is on a real page, and it should record which
  // one. A term with no landing has none to record.
  const landing = await loadLandingTranslation(deps, input, term);
  const content: PageContent =
    landing?.publishedSnapshot ?? defaultTermLayout(term, input.locale);

  const [chrome, resolvedContent] = await Promise.all([
    resolveSiteChrome(deps, input.tenantId, site, input.locale),
    resolvePageContent(deps, input.tenantId, site.id, input.locale, content),
  ]);

  return {
    id: landing?.id ?? null,
    content: resolvedContent,
    seoMeta: seoMetaFor(term, input.locale),
    locale: input.locale,
    translations: termTranslations(term, taxonomy, site.enabledLocales),
    // A term has no ancestors in its address, so it has no breadcrumb
    // trail either — the empty list is the honest answer, not a gap.
    ancestors: [],
    header: chrome.header,
    footer: chrome.footer,
    headerSticky: chrome.headerSticky,
    site: chrome.site,
    term: {
      id: term.id,
      name: term.name[input.locale] ?? '',
      description: term.description[input.locale] ?? '',
      hasLandingPage: landing !== null,
      // Carried to the renderer rather than decided there: the page has
      // to say `noindex` in its own head, and the sitemap has to leave
      // the same term out (docs/adr/0078).
      noindex: term.noindex,
    },
  };
}

/**
 * `null` when there is no landing page, when it has no translation in
 * this language, or when that translation is not published — all three
 * fall back to the default layout rather than to a 404, which is the
 * whole point of rendering in place.
 */
async function loadLandingTranslation(
  deps: GetPublishedTermByPathDeps,
  input: GetPublishedTermByPathInput,
  term: Term,
): Promise<{ id: string; publishedSnapshot: PageContent } | null> {
  if (!term.landingPageGroupId) return null;
  const translation = await deps.pageTranslationRepository.findByGroupAndLocale(
    input.tenantId,
    term.landingPageGroupId,
    input.locale,
  );
  if (!translation || translation.status !== 'published') return null;
  const snapshot = translation.publishedSnapshot;
  // A published translation with no snapshot has nothing to render, so the
  // default layout takes over and there is no page to name either.
  if (!snapshot) return null;
  return { id: translation.id, publishedSnapshot: snapshot };
}

/**
 * What a term looks like before anybody builds it a page: its name, its
 * introduction, and the pages filed under it.
 *
 * Built as ordinary blocks rather than as a bespoke template, so a term
 * page is styled, themed and overridden exactly like every other page —
 * and so the one block that is specific to this (`PageGrid`) is the same
 * one an author can place by hand anywhere else.
 */
function defaultTermLayout(term: Term, locale: string): PageContent {
  const name = term.name[locale] ?? '';
  const description = term.description[locale] ?? '';
  return [
    // `Hero` and not `Heading`: it is the only block that renders an
    // `<h1>`, which is what a term's page needs — `Heading` offers h2/h3
    // by design, for sections INSIDE a page. It also carries the
    // introduction, so the default layout is two blocks rather than
    // three.
    {
      id: `term-${term.id}-hero`,
      type: 'Hero',
      props: { title: name, subtitle: description, eyebrow: '' },
    },
    {
      id: `term-${term.id}-pages`,
      type: 'PageGrid',
      props: {
        termId: term.id,
        layout: 'list',
        limit: 0,
        emptyText: '',
        items: [],
      },
    },
  ];
}

/** The term's own SEO block, falling back to its name — a term with no meta title is not a page with no title. */
function seoMetaFor(term: Term, locale: string): SeoMeta {
  const declared = term.seoMeta[locale];
  if (declared) return declared;
  return {
    title: term.name[locale] ?? '',
    description: term.description[locale] ?? '',
  };
}

/**
 * The same shape a page's translations have, so the language switcher and
 * the `hreflang` alternates work on a term page without knowing it is
 * one.
 *
 * `ancestorSlugs` carries the dimension's prefix: a term's address has no
 * ancestors, but it does have that one leading segment, and this is the
 * field the consumers already join into a path.
 */
function termTranslations(
  term: Term,
  taxonomy: Taxonomy,
  enabledLocales: string[],
): { locale: string; slug: string; ancestorSlugs: string[] }[] {
  return enabledLocales.flatMap((locale) => {
    const slug = term.slugFor(locale);
    return slug === null
      ? []
      : [
          {
            locale,
            slug,
            ancestorSlugs: taxonomy.prefix ? [taxonomy.prefix] : [],
          },
        ];
  });
}

/** The address a term answers at in one language, or `null` where it has none — used by the sitemap (docs/adr/0064). */
export function termPathFor(
  term: Term,
  taxonomy: Taxonomy,
  locale: string,
): string | null {
  const slug = term.slugFor(locale);
  if (slug === null) return null;
  return localePathFromAncestors(
    locale,
    taxonomy.prefix ? [taxonomy.prefix] : [],
    slug,
  );
}
