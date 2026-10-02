import type { PublishedPage } from '@kometio/api-contracts';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SiteLayoutSectionRepositoryPort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import { resolveSiteChrome } from './resolve-site-chrome';
import { termPathFor } from './get-published-term-by-path.use-case';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import { resolvePageGroupByPath } from './resolve-page-group-by-path';
import { resolvePageContent } from './resolve-page-content-references';
import { currentArticleOf } from './resolve-article-blocks';
import { resolveTranslationPaths } from './resolve-translation-paths';
import type { MediaUrlResolver } from './author-profile';

export type { PublishedPage };

export interface GetPublishedPageBySlugDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
  /**
   * Only to ask whether a term has claimed this page as its landing page
   * (docs/adr/0067) — the page then answers at the term's address and
   * this one redirects there.
   */
  taxonomyRepository: TaxonomyRepositoryPort;
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  /** Only for an article's byline — read once, and only on a page that carries an ArticleMeta block. */
  userRepository?: UserRepositoryPort;
  /** Only for the author's picture in an AuthorBox. */
  mediaStorage?: MediaUrlResolver;
}

/**
 * What an address serves: a page, a permanent move, or nothing.
 *
 * Three answers and not two, since ADR-0067 — a page that has become a
 * term's landing page is rendered on the term's URL, so its own slug
 * stops being where that content lives. Modelling the move as a third
 * answer is what keeps the caller from having to guess: `page: null`
 * with a `redirectTo` is not "missing", it is "moved".
 */
/** The answer for every "no page here" branch — one object, so the branches cannot drift apart. */
const NOTHING: PublishedPageLookup = { page: null, redirectTo: null };

export interface PublishedPageLookup {
  page: PublishedPage | null;
  /** The address this content lives at now — a locale path, ready to redirect to. */
  redirectTo: string | null;
}

export interface GetPublishedPageBySlugInput {
  tenantId: string;
  domain: string;
  locale: string;
  /** Full URL path, root to leaf (e.g. ['servizi', 'idraulica']) — sibling-scoped slugs mean the trailing segment alone is ambiguous, see resolvePageGroupByPath. */
  segments: string[];
}

/**
 * i18n a livello di campo (see the plan) — replaces the old Page-based
 * implementation. `content` is always `translation.publishedSnapshot`
 * (frozen at the last publish(), see PageTranslation's own doc comment),
 * NEVER a live merge of PageGroup.content + fieldValues: a draft
 * structural edit on the group must not leak into what a visitor sees
 * before that translation is explicitly republished, same "draft vs.
 * published" wall the old model had. Same public-read posture as before
 * otherwise: only ever published content, resolves the site from `domain`
 * rather than trusting a client-supplied id, `locale` is caller-supplied
 * and never searches sibling locales itself (see
 * resolveUntranslatedPageFallback for that).
 */
export async function getPublishedPageBySlug(
  deps: GetPublishedPageBySlugDeps,
  input: GetPublishedPageBySlugInput,
): Promise<PublishedPageLookup> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return NOTHING;
  }

  const resolved = await resolvePageGroupByPath(
    {
      pageGroupRepository: deps.pageGroupRepository,
      pageTranslationRepository: deps.pageTranslationRepository,
    },
    input.tenantId,
    site.id,
    input.locale,
    input.segments,
  );
  if (!resolved) {
    return NOTHING;
  }
  const { translation, ancestors } = resolved;
  if (translation.status !== 'published' || !translation.publishedSnapshot) {
    return NOTHING;
  }

  // The path asked for contains an address one of these pages has since
  // left. Answering here would leave the same content readable at two
  // addresses — the duplicate a rename is supposed to end, not create —
  // so the visitor is sent to where the page lives now, permanently. It
  // is checked before the term claim below only because it is cheaper;
  // a page that has both moved and been claimed ends up at the term
  // either way, in two hops.
  if (resolved.moved) {
    const [leaf, ...reversed] = [...resolved.currentPath].reverse();
    return {
      page: null,
      redirectTo: localePathFromAncestors(
        input.locale,
        reversed.reverse(),
        leaf ?? '',
      ),
    };
  }

  // Asked before anything is built: a page a term has claimed does not
  // serve this address any more, and assembling it would be work whose
  // only use is to be thrown away (docs/adr/0067).
  const claimedBy = await deps.taxonomyRepository.findTermByLandingPage(
    input.tenantId,
    translation.pageGroupId,
  );
  if (claimedBy) {
    const taxonomy = await deps.taxonomyRepository.findTaxonomyById(
      input.tenantId,
      claimedBy.taxonomyId,
    );
    const to = taxonomy ? termPathFor(claimedBy, taxonomy, input.locale) : null;
    // No address in THIS language means the term is not published here,
    // so there is nowhere to send the visitor — the page keeps answering
    // rather than 404ing on a language the term never reached.
    if (to) {
      return { page: null, redirectTo: to };
    }
  }

  const [siblings, chrome, resolvedContent] = await Promise.all([
    deps.pageTranslationRepository.listByGroup(
      input.tenantId,
      translation.pageGroupId,
    ),
    resolveSiteChrome(deps, input.tenantId, site, input.locale),
    resolvePageContent(
      deps,
      input.tenantId,
      site.id,
      input.locale,
      translation.publishedSnapshot,
      () => currentArticleOf(deps, input.tenantId, translation),
    ),
  ]);
  // Not `{ locale, slug }`: a slug alone is not an address once slugs are
  // sibling-scoped (ADR-0029). See resolveTranslationPaths — it also drops
  // a language whose ancestor chain is incomplete, because the page has no
  // URL there at all.
  const translations = await resolveTranslationPaths(
    {
      pageGroupRepository: deps.pageGroupRepository,
      pageTranslationRepository: deps.pageTranslationRepository,
    },
    input.tenantId,
    resolved.group.parentId,
    siblings.filter((sibling) => sibling.status === 'published'),
  );

  return {
    redirectTo: null,
    page: {
      id: translation.id,
      content: resolvedContent,
      seoMeta: translation.seoMeta,
      locale: translation.locale,
      translations,
      ancestors,
      header: chrome.header,
      footer: chrome.footer,
      headerSticky: chrome.headerSticky,
      site: chrome.site,
    },
  };
}
