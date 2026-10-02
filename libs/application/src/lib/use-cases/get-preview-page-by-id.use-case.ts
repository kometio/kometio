import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  PreviewTokenPort,
  SiteLayoutSectionRepositoryPort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import { resolveSiteChrome } from './resolve-site-chrome';
import { resolvePageGroupAncestors } from './resolve-page-group-ancestors';
import { resolveTranslationPaths } from './resolve-translation-paths';
import { resolvePageContent } from './resolve-page-content-references';
import { loadPublishedSections } from './resolve-section-instances';
import { currentArticleOf } from './resolve-article-blocks';
import type { PublishedPage } from './get-published-page-by-slug.use-case';
import type { MediaUrlResolver } from './author-profile';

export interface GetPreviewPageByIdDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteRepository: SiteRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  /** Which pages carry which term — what a PageGrid on the previewed page is asking. */
  taxonomyRepository: TaxonomyRepositoryPort;
  previewTokenPort: PreviewTokenPort;
  /** Only for an article's byline — read once, and only on a page that carries an ArticleMeta block. */
  userRepository?: UserRepositoryPort;
  /** Only for the author's picture in an AuthorBox. */
  mediaStorage?: MediaUrlResolver;
}

export interface GetPreviewPageByIdInput {
  tenantId: string;
  /** A PageTranslation id — was a Page id under the old model (see the plan). */
  pageId: string;
  token: string;
}

/**
 * i18n a livello di campo (see the plan) — replaces the old Page-based
 * implementation, same unauthenticated-but-token-gated posture as before
 * (see the original's own doc comment). Shows the CURRENT draft, not the
 * frozen publishedSnapshot: for a linked translation that's the live
 * merge of PageGroup.content + this locale's fieldValues (so a structural
 * edit shows up in preview immediately, matching what saving the group
 * would look like once this translation republishes), for a diverged one
 * it's `divergedContent` directly.
 */
export async function getPreviewPageById(
  deps: GetPreviewPageByIdDeps,
  input: GetPreviewPageByIdInput,
): Promise<PublishedPage | null> {
  const validToken = await deps.previewTokenPort.validateToken(
    input.token,
    'page',
    input.pageId,
  );
  if (!validToken || validToken.tenantId !== input.tenantId) {
    return null;
  }

  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageId,
  );
  if (!translation) {
    return null;
  }

  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    translation.pageGroupId,
  );
  if (!group) {
    return null;
  }

  const site = await deps.siteRepository.findById(
    input.tenantId,
    translation.siteId,
  );
  if (!site) {
    return null;
  }

  const content = translation.currentContent(group.content);

  const [siblings, chrome, ancestors, resolvedContent] = await Promise.all([
    deps.pageTranslationRepository.listByGroup(input.tenantId, group.id),
    resolveSiteChrome(deps, input.tenantId, site, translation.locale, {
      preview: true,
    }),
    resolvePageGroupAncestors(
      deps,
      input.tenantId,
      translation.locale,
      site.defaultLocale,
      group.parentId,
    ),
    resolvePageContent(
      deps,
      input.tenantId,
      translation.siteId,
      translation.locale,
      content,
      () => currentArticleOf(deps, input.tenantId, translation),
    ),
  ]);
  // Same as the published route: a slug is not an address on its own, see
  // resolveTranslationPaths.
  const translations = await resolveTranslationPaths(
    {
      pageGroupRepository: deps.pageGroupRepository,
      pageTranslationRepository: deps.pageTranslationRepository,
    },
    input.tenantId,
    group.parentId,
    siblings.filter((sibling) => sibling.status === 'published'),
  );

  // What the CANVAS needs on top of the page itself: the blocks of the
  // sections it uses, so re-rendering one block at a time can graft them
  // (see loadPublishedSections). A read of its own, on the preview route
  // only — the published route has no use for it.
  const sections = await loadPublishedSections(deps, input.tenantId, [
    content,
    chrome.header ?? [],
    chrome.footer ?? [],
  ]);

  return {
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
    ...(sections.size > 0 ? { sections: Object.fromEntries(sections) } : {}),
  };
}
