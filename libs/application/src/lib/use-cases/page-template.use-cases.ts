import { randomUUID } from 'node:crypto';
import {
  NotAPageTemplateError,
  PageGroupNotFoundError,
  ReusableSectionNotFoundError,
  type ReusableSection,
} from '@kometio/domain-core';
import { copySectionBlocks, type PageContent } from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { createReusableSection } from './reusable-section.use-cases';
import { requireSite } from './require-site';

/**
 * A page template is a reusable section of kind `template` (docs/adr/0072)
 * — the same object the canvas already inserts as a copy, used at the
 * other moment a page gets blocks: when it is created.
 *
 * Nothing here links a page to the template it came from. The blocks are
 * copied once and the page owns them; a strip that has to stay the same
 * everywhere goes INTO the template as a shared section, and that
 * reference survives the copy like any other block's props.
 */

/**
 * The published blocks of a template this site's pages may start from.
 *
 * Another site's section answers "not found" rather than "not a template":
 * which ids exist on a site nobody here can see is not something to
 * confirm one refusal at a time.
 */
async function publishedTemplateContent(
  reusableSectionRepository: ReusableSectionRepositoryPort,
  tenantId: string,
  siteId: string,
  templateId: string,
): Promise<PageContent> {
  const section = await reusableSectionRepository.findById(
    tenantId,
    templateId,
  );
  if (!section || section.siteId !== siteId) {
    throw new ReusableSectionNotFoundError(templateId);
  }
  if (section.kind !== 'template' || !section.publishedContent) {
    throw new NotAPageTemplateError(templateId);
  }
  return section.publishedContent;
}

/** Refuses anything a page of this site could not start from — for a collection's default, which the New page dialog will offer. */
export async function assertPageTemplate(
  reusableSectionRepository: ReusableSectionRepositoryPort,
  tenantId: string,
  siteId: string,
  templateId: string,
): Promise<void> {
  await publishedTemplateContent(
    reusableSectionRepository,
    tenantId,
    siteId,
    templateId,
  );
}

/**
 * The blocks a new page starts with when it starts from this template: a
 * copy of what the template PUBLISHED, with new ids.
 *
 * New ids on every copy, as when the canvas inserts a template: a block id
 * keys the per-block style rule and the translation overlay, and ten
 * pages started from one template must not be ten documents that happen
 * to agree on them — nor share them with the template, whose own editor
 * would otherwise be styling the same ids.
 */
export async function pageTemplateStartingContent(
  reusableSectionRepository: ReusableSectionRepositoryPort,
  tenantId: string,
  siteId: string,
  templateId: string,
): Promise<PageContent> {
  const published = await publishedTemplateContent(
    reusableSectionRepository,
    tenantId,
    siteId,
    templateId,
  );
  return copySectionBlocks(published, randomUUID);
}

export interface SavePageGroupAsTemplateDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteRepository: SiteRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  reusableSectionVersionRepository: ReusableSectionVersionRepositoryPort;
}

export interface SavePageGroupAsTemplateInput {
  tenantId: string;
  pageGroupId: string;
  name: string;
  actorUserId: string | null;
}

/**
 * "Save as template" on a page: a new template holding what the page shows
 * in the site's DEFAULT language, published at once.
 *
 * The default language whichever one the editor happens to be looking at,
 * because a template has one language and a new page starts in the
 * default one — so a template saved from the English view of an Italian
 * site would start every new Italian page in English. Translating the
 * pages made from it is the job of whoever writes them, the same as for a
 * page started blank. A page that has no translation in the default
 * language falls back to its shared structure, which is where the default
 * language's text lives.
 *
 * Published straight away, like "turn into a reusable section": the New
 * page dialog offers only published templates, so a draft would make the
 * button look as if it had done nothing. Published in the same save that
 * creates it rather than by a second call, so there is no moment — and no
 * failure — that leaves a draft holding the name.
 */
export async function savePageGroupAsTemplate(
  deps: SavePageGroupAsTemplateDeps,
  input: SavePageGroupAsTemplateInput,
): Promise<ReusableSection> {
  const group = await deps.pageGroupRepository.findById(
    input.tenantId,
    input.pageGroupId,
  );
  if (!group) {
    throw new PageGroupNotFoundError(input.pageGroupId);
  }
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    group.siteId,
  );
  const translations = await deps.pageTranslationRepository.listByGroup(
    input.tenantId,
    group.id,
  );
  const inDefaultLanguage = translations.find(
    (translation) => translation.locale === site.defaultLocale,
  );
  const content = inDefaultLanguage
    ? inDefaultLanguage.currentContent(group.content)
    : group.content;

  return createReusableSection(deps, {
    tenantId: input.tenantId,
    siteId: group.siteId,
    name: input.name,
    kind: 'template',
    content: copySectionBlocks(content, randomUUID),
    published: true,
    actorUserId: input.actorUserId,
  });
}
