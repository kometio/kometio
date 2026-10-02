import type { Block, SiteLayoutSectionKind } from '@kometio/shared-types';
import type { PublishedSite } from '@kometio/api-contracts';
import type { Site, SiteLayoutSection } from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SiteLayoutSectionRepositoryPort,
  SiteThemeBlockStylesPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import { resolvePageContentReferences } from './resolve-page-content-references';

export type { PublishedSite };

export interface PublishedSiteChrome {
  site: PublishedSite;
  header: Block[] | null;
  footer: Block[] | null;
  headerSticky: boolean;
}

export interface ResolveSiteChromeDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  // Needed to turn a header/footer link into a reachable address: a page
  // reference resolves to the whole ancestor chain, not just its slug.
  pageGroupRepository: PageGroupRepositoryPort;
  /** Passed straight through to the shared reference pass — a header holds links, not page grids, but the pass is one. */
  taxonomyRepository: TaxonomyRepositoryPort;
}

/**
 * Resolves a cookie banner policy link (docs/adr/0039) to THIS locale's own
 * published slug — `null` when unset, not yet translated into this locale,
 * or still a draft: a link to an unpublished page must never leak to the
 * public site, same rule already applied to header/footer sections above.
 */
async function resolvePolicySlug(
  pageTranslationRepository: PageTranslationRepositoryPort,
  tenantId: string,
  pageGroupId: string | null,
  locale: string,
): Promise<string | null> {
  if (!pageGroupId) {
    return null;
  }
  const translation = await pageTranslationRepository.findByGroupAndLocale(
    tenantId,
    pageGroupId,
    locale,
  );
  return translation?.status === 'published' ? translation.slug : null;
}

/**
 * A section (header or footer) exists per (site, locale, kind) — when a
 * locale never had one of its own (created only for the default locale,
 * during the site's initial setup for instance), without this fallback
 * `findBySiteLocaleKind` returned `null` and the page came out with neither
 * header nor footer, in every locale other than the default one — a bug
 * reported live (2026-08-22): a page published in English on a site set up
 * in Italian lost both the nav and the footer. The same idea as
 * `untranslatedPageFallback` for pages (show the default locale's content
 * rather than nothing), applied here to the header and footer. A section
 * never created for ANY locale stays `null` even after the fallback — there
 * is nothing to show in that case.
 */
async function findSectionWithLocaleFallback(
  repository: SiteLayoutSectionRepositoryPort,
  tenantId: string,
  site: Site,
  locale: string,
  kind: SiteLayoutSectionKind,
): Promise<SiteLayoutSection | null> {
  const section = await repository.findBySiteLocaleKind(
    tenantId,
    site.id,
    locale,
    kind,
  );
  if (section || locale === site.defaultLocale) {
    return section;
  }
  return repository.findBySiteLocaleKind(
    tenantId,
    site.id,
    site.defaultLocale,
    kind,
  );
}

/**
 * Shared by getPublishedPageBySlug and getPublishedSiteChrome — resolving
 * header/footer/site depends only on (site, locale), never on which
 * specific page (if any) is being rendered alongside it. Split out so a
 * route with no backing Page row (e.g. apps/public-site's search.astro)
 * can get the site's normal chrome without needing a page to anchor to.
 *
 * `preview: true` (used only by getPreviewPageById, gated on that page's own
 * valid preview token — see docs/adr/0024) reads
 * each section's draft `content` regardless of its own `status`, instead of
 * the published-only collapse below. A section that was never created at
 * all still resolves to `null` either way — there is nothing to preview.
 */
export async function resolveSiteChrome(
  deps: ResolveSiteChromeDeps,
  tenantId: string,
  site: Site,
  locale: string,
  options: { preview?: boolean } = {},
): Promise<PublishedSiteChrome> {
  const preview = options.preview ?? false;
  const [headerSection, footerSection, blockStyles] = await Promise.all([
    findSectionWithLocaleFallback(
      deps.siteLayoutSectionRepository,
      tenantId,
      site,
      locale,
      'header',
    ),
    findSectionWithLocaleFallback(
      deps.siteLayoutSectionRepository,
      tenantId,
      site,
      locale,
      'footer',
    ),
    deps.siteThemeBlockStylesRepository.listBySite(tenantId, site.id),
  ]);

  function resolveContent(section: typeof headerSection): Block[] | null {
    if (!section) {
      return null;
    }
    return preview
      ? section.content
      : section.status === 'published'
        ? section.publishedContent
        : null;
  }

  const header = resolveContent(headerSection);
  const footer = resolveContent(footerSection);
  // NavLink lives in header/footer above all else — resolve any `page`
  // reference in both for this locale (see resolve-page-content-references.ts).
  // An absent one goes in as an empty tree and comes back as one, so the
  // default here is the same "nothing" and never stands in for content.
  const [resolvedHeader = [], resolvedFooter = []] =
    await resolvePageContentReferences(deps, tenantId, site.id, locale, [
      header ?? [],
      footer ?? [],
    ]);

  const [privacyPolicySlug, cookiePolicySlug] = await Promise.all([
    resolvePolicySlug(
      deps.pageTranslationRepository,
      tenantId,
      site.cookieBannerSettings.privacyPolicyPageGroupId,
      locale,
    ),
    resolvePolicySlug(
      deps.pageTranslationRepository,
      tenantId,
      site.cookieBannerSettings.cookiePolicyPageGroupId,
      locale,
    ),
  ]);

  return {
    header: header ? resolvedHeader : null,
    footer: footer ? resolvedFooter : null,
    headerSticky: preview
      ? (headerSection?.sticky ?? false)
      : headerSection?.status === 'published'
        ? headerSection.sticky
        : false,
    site: {
      name: site.name,
      domain: site.domain,
      themeName: site.themeName,
      defaultLocale: site.defaultLocale,
      enabledLocales: site.enabledLocales,
      untranslatedPageFallback: site.untranslatedPageFallback,
      businessAddress: site.businessAddress,
      businessPhone: site.businessPhone,
      businessEmail: site.businessEmail,
      businessType: site.businessType,
      openingHours: site.openingHours,
      searchEngineIndexingEnabled: site.searchEngineIndexingEnabled,
      themeSettings: site.themeSettings,
      themeTokens: { blockStyles },
      cookieBannerSettings: site.cookieBannerSettings,
      privacyPolicySlug,
      cookiePolicySlug,
    },
  };
}
