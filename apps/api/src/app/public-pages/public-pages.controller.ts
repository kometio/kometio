import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PublicPagesThrottlerGuard } from './public-pages-throttler.guard';
import {
  getPreviewPageById,
  getPreviewReusableSectionById,
  getPublishedAuthorBySlug,
  getPublishedPageBySlug,
  getPublishedSiteChrome,
  getPublishedTermByPath,
  listPublishedFeedEntries,
  listPublishedPagesForSitemap,
  listPublishedPageTree,
  resolveUntranslatedPageFallback,
  searchPages,
} from '@kometio/application';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type PublicAuthorBySlugQuery,
  publicAuthorBySlugQuerySchema,
  type PublicPageBySlugQuery,
  publicPageBySlugQuerySchema,
  type PublicPagePreviewQuery,
  publicPagePreviewQuerySchema,
  type PublicSectionPreviewQuery,
  publicSectionPreviewQuerySchema,
  type PublicPagesChromeQuery,
  publicPagesChromeQuerySchema,
  type PublicPagesFeedQuery,
  publicPagesFeedQuerySchema,
  type PublicPagesSearchQuery,
  publicPagesSearchQuerySchema,
  type PublicPagesSitemapQuery,
  publicPagesSitemapQuerySchema,
  type PublicPagesTreeQuery,
  publicPagesTreeQuerySchema,
  type PublicTermByPathQuery,
  publicTermByPathQuerySchema,
} from './public-pages.schemas';
import { UuidParam } from '../uuid-param.decorator';
import type { PublicPagesDeps } from './public-pages.deps';
import { PUBLIC_PAGES_DEPS } from './public-pages.tokens';

// No SessionAuthGuard on this controller — it's the public, unauthenticated
// read path apps/public-site's SSR calls. Deliberately read-only: there is
// no create/update/delete route here, not just "none exposed in the UI".
@Controller('public/pages')
@UseGuards(PublicPagesThrottlerGuard)
export class PublicPagesController {
  constructor(
    @Inject(PUBLIC_PAGES_DEPS) private readonly deps: PublicPagesDeps,
  ) {}

  /**
   * An author's own page (docs/adr/0071).
   *
   * Asked by apps/public-site after both the page and the term lookups
   * have come back empty, like `term-by-path` after `by-slug`: a page or a
   * term an editor put at the same address always wins over one the
   * system made.
   */
  @Get('author-by-slug')
  async findAuthorBySlug(
    @Query(new ZodValidationPipe(publicAuthorBySlugQuerySchema))
    query: PublicAuthorBySlugQuery,
  ) {
    const result = await getPublishedAuthorBySlug(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
      slug: query.slug,
    });
    // The person changed their address: a 404 with somewhere to go, the
    // same shape `by-slug` answers a moved page with.
    if (result.redirectTo) {
      throw new NotFoundException({
        fallback: null,
        movedTo: result.redirectTo,
      });
    }
    if (!result.author) {
      throw new NotFoundException('Author not found');
    }
    return result.author;
  }

  /**
   * A term's own page (docs/adr/0064).
   *
   * A separate endpoint rather than a branch inside `by-slug`: the two
   * lookups answer different questions, and apps/public-site asks this
   * one only after the page lookup has come back empty — which is what
   * makes "a page always wins" true at render time, not only at write
   * time.
   */
  @Get('term-by-path')
  async findTermByPath(
    @Query(new ZodValidationPipe(publicTermByPathQuerySchema))
    query: PublicTermByPathQuery,
  ) {
    const term = await getPublishedTermByPath(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
      segments: query.path,
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
    return term;
  }

  @Get('by-slug')
  async findBySlug(
    @Query(new ZodValidationPipe(publicPageBySlugQuerySchema))
    query: PublicPageBySlugQuery,
  ) {
    const result = await getPublishedPageBySlug(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
      segments: query.path,
    });
    // The content moved to a term's address (docs/adr/0067). A 404 with
    // somewhere to go, exactly like the untranslated-page fallback below
    // — apps/public-site is what turns either into a real redirect,
    // because which status code a VISITOR gets is a decision about
    // browsers and crawlers, not about data.
    if (result.redirectTo) {
      throw new NotFoundException({
        fallback: null,
        movedTo: result.redirectTo,
      });
    }
    // A draft page and a page that doesn't exist get the identical 404 —
    // getPublishedPageBySlug already collapses both cases into `null`, so
    // there's no way for this handler to tell them apart even if it wanted
    // to (see the use case's own comment on why that's deliberate).
    if (!result.page) {
      // Direct navigation/old link/crawler on a (locale, slug) that was
      // never translated — the language switcher can't help here, it only
      // computes a fallback once a page IS found. `fallback` is `null` when
      // there's nowhere better to send the visitor (site set to
      // 'not-available', or the default-locale page doesn't exist either):
      // apps/public-site renders a real 404 in that case, same as today.
      const fallback = await resolveUntranslatedPageFallback(this.deps, {
        tenantId: await this.deps.tenant.require(),
        domain: query.domain,
        locale: query.locale,
        segments: query.path,
      });
      throw new NotFoundException({ fallback, movedTo: null });
    }
    return result.page;
  }

  @Get(':id/preview')
  async preview(
    @UuidParam('id') id: string,
    @Query(new ZodValidationPipe(publicPagePreviewQuerySchema))
    query: PublicPagePreviewQuery,
  ) {
    const result = await getPreviewPageById(this.deps, {
      tenantId: await this.deps.tenant.require(),
      pageId: id,
      token: query.token,
    });
    // The same "indistinguishable from non-existent" posture as findBySlug:
    // a missing, expired or mismatched token and a page that does not exist
    // all get the same 404, giving no oracle for guessing valid page ids.
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  /**
   * The section editor's canvas. A route of its own rather than a flag on
   * the page preview: it validates a token minted for a SECTION, so a page
   * token can never reach it and vice versa.
   */
  @Get('sections/:id/preview')
  async previewSection(
    @UuidParam('id') id: string,
    @Query(new ZodValidationPipe(publicSectionPreviewQuerySchema))
    query: PublicSectionPreviewQuery,
  ) {
    const result = await getPreviewReusableSectionById(this.deps, {
      tenantId: await this.deps.tenant.require(),
      id,
      token: query.token,
      locale: query.locale,
    });
    // The same collapse as every other preview: missing, expired,
    // mismatched or non-existent all answer 404.
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  @Get('chrome')
  async chrome(
    @Query(new ZodValidationPipe(publicPagesChromeQuerySchema))
    query: PublicPagesChromeQuery,
  ) {
    const result = await getPublishedSiteChrome(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
    });
    // Same "nothing to show" collapse as findBySlug: an unrecognized
    // domain has no site to derive chrome from at all, 404 not a
    // graceful empty default — unlike search/listForSitemap below, there
    // is no sensible "chrome" a caller could render for a domain that
    // doesn't exist.
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  @Get('tree')
  async tree(
    @Query(new ZodValidationPipe(publicPagesTreeQuerySchema))
    query: PublicPagesTreeQuery,
  ) {
    const result = await listPublishedPageTree(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
    });
    // Same "nothing to show" collapse as search/listForSitemap — an
    // unrecognized domain has nothing to build a nav tree from, and a
    // theme's sidebar has nowhere useful to send a 404 to anyway.
    return { items: result ?? [] };
  }

  @Get('search')
  async search(
    @Query(new ZodValidationPipe(publicPagesSearchQuerySchema))
    query: PublicPagesSearchQuery,
  ) {
    const result = await searchPages(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
      query: query.q,
    });
    // An unrecognized domain returns an empty result list, not a 404 —
    // same "nothing to show" collapse as listForSitemap below, and a
    // search box has nowhere useful to send a 404 to anyway.
    return { items: result ?? [] };
  }

  @Get('feed')
  async feed(
    @Query(new ZodValidationPipe(publicPagesFeedQuerySchema))
    query: PublicPagesFeedQuery,
  ) {
    const result = await listPublishedFeedEntries(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      locale: query.locale,
      termSlug: query.term,
      limit: query.limit,
    });
    // An unknown domain answers with an empty feed rather than a 404 — the
    // same posture the sitemap takes below, and for the same reason: a
    // feed reader pointed at a domain this deployment does not serve has
    // made a mistake nobody reading the feed can fix.
    return result ?? { siteName: '', entries: [] };
  }

  @Get()
  async listForSitemap(
    @Query(new ZodValidationPipe(publicPagesSitemapQuerySchema))
    query: PublicPagesSitemapQuery,
  ) {
    const result = await listPublishedPagesForSitemap(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
    });
    // An unrecognized domain renders as an empty, indexing-allowed
    // sitemap/robots response, not a 404 — see listPublishedPagesForSitemap's
    // own comment on why, and docs/adr/0016 for the indexing-allowed default.
    // `defaultLocale` has no real answer here (there's no site to derive it
    // from) — 'it' is a harmless placeholder since `items` is always empty
    // in this branch, so nothing ever actually reads it as a locale prefix.
    return (
      result ?? {
        items: [],
        searchEngineIndexingEnabled: true,
        defaultLocale: 'it',
      }
    );
  }
}
