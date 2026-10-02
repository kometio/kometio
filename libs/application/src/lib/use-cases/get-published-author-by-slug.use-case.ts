import {
  authorPathSegment,
  type PageContent,
  type SeoMeta,
} from '@kometio/shared-types';
import { type PublishedAuthor } from '@kometio/api-contracts';
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
import type { User } from '@kometio/domain-core';
import { resolveSiteChrome } from './resolve-site-chrome';
import { resolvePageContent } from './resolve-page-content-references';
import {
  listPublishedPagePaths,
  type PublishedPagePath,
} from './list-published-page-paths';
import {
  authorPath,
  avatarMedia,
  hasAuthorPage,
  toPublicAuthor,
  type MediaUrlResolver,
} from './author-profile';

export interface GetPublishedAuthorBySlugDeps {
  siteRepository: SiteRepositoryPort;
  userRepository: UserRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  mediaStorage: MediaUrlResolver;
}

export interface GetPublishedAuthorBySlugInput {
  tenantId: string;
  domain: string;
  locale: string;
  slug: string;
}

export interface PublishedAuthorLookup {
  author: PublishedAuthor | null;
  /** The address the person moved their page to, for a 301 — set only when `author` is null. */
  redirectTo: string | null;
}

/** How long a search result's description can usefully be. */
const DESCRIPTION_MAX_CHARS = 160;

/**
 * A person's author page (docs/adr/0071), for the public, unauthenticated
 * read path: `/it/autore/giulia-rossi`.
 *
 * Shaped exactly like a page, the way a term's is (ADR-0066), so the site
 * draws it with the same component, chrome and blocks. It answers only for
 * someone with a name, an address and at least one published article in
 * this language — a page listing nothing is a page nobody should land on,
 * and an admin who only ever made the home page is not an author.
 *
 * An address the person has left answers with where they went.
 */
export async function getPublishedAuthorBySlug(
  deps: GetPublishedAuthorBySlugDeps,
  input: GetPublishedAuthorBySlugInput,
): Promise<PublishedAuthorLookup> {
  const none: PublishedAuthorLookup = { author: null, redirectTo: null };
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site || !site.enabledLocales.includes(input.locale)) {
    return none;
  }

  const current = await deps.userRepository.findBySlug(
    input.tenantId,
    input.slug,
  );
  const moved = current
    ? null
    : await deps.userRepository.findByFormerSlug(input.tenantId, input.slug);
  const user = current ?? moved;
  if (!user) {
    return none;
  }

  const paths = await listPublishedPagePaths(deps, input.tenantId, site.id);
  // Asked of the person at their CURRENT address, and before a redirect as
  // much as before a page: an old address must not 301 to a 404, nor tell
  // anyone the new address of someone who has no page to show.
  if (!hasAuthorPage(user, input.locale, paths)) {
    return none;
  }
  if (moved?.slug) {
    return { author: null, redirectTo: authorPath(input.locale, moved.slug) };
  }

  const publicAuthor = toPublicAuthor(
    user,
    input.locale,
    paths,
    deps.mediaStorage,
  );
  const content = defaultAuthorLayout(user, publicAuthor);
  const [chrome, resolvedContent] = await Promise.all([
    resolveSiteChrome(deps, input.tenantId, site, input.locale),
    resolvePageContent(deps, input.tenantId, site.id, input.locale, content),
  ]);

  return {
    redirectTo: null,
    author: {
      // An author archive is assembled from a query, not from a page
      // somebody edits — there is no page behind it to name (ADR-0071).
      id: null,
      content: resolvedContent,
      seoMeta: seoMetaFor(user, input.locale, deps.mediaStorage),
      locale: input.locale,
      translations: authorTranslations(user, paths, site.enabledLocales),
      // An author page is not under anything in the page tree.
      ancestors: [],
      header: chrome.header,
      footer: chrome.footer,
      headerSticky: chrome.headerSticky,
      site: chrome.site,
      author: publicAuthor,
    },
  };
}

/**
 * Who they are, then what they wrote — two ordinary blocks, as a term's
 * page is (ADR-0066), so the page is styled and themed like any other.
 */
function defaultAuthorLayout(
  user: User,
  publicAuthor: PublishedAuthor['author'],
): PageContent {
  return [
    {
      id: `author-${user.id}-profile`,
      type: 'AuthorBox',
      props: {
        showBio: true,
        // It IS the page the link would go to.
        showArticlesLink: false,
        author: publicAuthor,
        isProfilePage: true,
      },
    },
    {
      id: `author-${user.id}-articles`,
      type: 'PageGrid',
      props: {
        termId: null,
        authorId: user.id,
        layout: 'cards',
        order: 'newest',
        limit: 0,
        perPage: 12,
        emptyText: '',
        items: [],
      },
    },
  ];
}

function seoMetaFor(
  user: User,
  locale: string,
  media: MediaUrlResolver,
): SeoMeta {
  const bio = (user.bio[locale] ?? '').replace(/\s+/g, ' ').trim();
  const avatar = avatarMedia(user.avatar, media);
  return {
    title: user.displayName?.trim() ?? '',
    description:
      bio.length > DESCRIPTION_MAX_CHARS
        ? `${bio.slice(0, DESCRIPTION_MAX_CHARS - 1).trimEnd()}…`
        : bio,
    ...(avatar ? { ogTags: { image: avatar.url } } : {}),
  };
}

/**
 * The languages this page exists in: those where the person has an
 * article. Their address is the same in every language; the word before
 * it is not (`autore`, `author`), and it travels as the one "ancestor" the
 * language switcher and the hreflang alternates already join into a path.
 */
function authorTranslations(
  user: User,
  paths: readonly PublishedPagePath[],
  enabledLocales: string[],
): { locale: string; slug: string; ancestorSlugs: string[] }[] {
  const slug = user.slug;
  if (!slug) return [];
  return enabledLocales
    .filter((locale) => hasAuthorPage(user, locale, paths))
    .map((locale) => ({
      locale,
      slug,
      ancestorSlugs: [authorPathSegment(locale)],
    }));
}
