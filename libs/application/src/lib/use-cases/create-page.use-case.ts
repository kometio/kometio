import { randomUUID } from 'node:crypto';
import { PageTranslation, type PageGroup } from '@kometio/domain-core';
import type { PageContent, SeoMeta } from '@kometio/shared-types';
import type {
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import {
  buildPageGroup,
  type CreatePageGroupInput,
} from './create-page-group.use-case';
import { assertPageTranslationAddressFree } from './page-translation-address';
import { placePageGroup, type PagePlacementDeps } from './page-placement';
import { pageTemplateStartingContent } from './page-template.use-cases';

export interface CreatePageDeps extends PagePlacementDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  /** Only when the page starts from a template. */
  reusableSectionRepository: ReusableSectionRepositoryPort;
}

export interface CreatePageInput extends CreatePageGroupInput {
  /** Start from a copy of this template's published blocks instead of `content` — never both (docs/adr/0072). */
  templateId?: string;
  /** The first language the page exists in. */
  locale: string;
  slug: string;
  seoMeta: SeoMeta;
}

export interface CreatedPage {
  group: PageGroup;
  translation: PageTranslation;
}

/**
 * A new page as the person creating it means it: the page AND its first
 * language, or nothing at all.
 *
 * It used to take two requests — the group, then its language — and the
 * second could be refused (an address already taken) after the first had
 * landed. That left a page with no language: listed with no title, and
 * crashing the editor that opened it. Everything that can refuse is asked
 * first — where it goes, its language, the template, the address — and then the three rows are written
 * in one transaction (`addWithTranslation`), which also catches an
 * address taken in the moment between the check and the write.
 */
export async function createPage(
  deps: CreatePageDeps,
  input: CreatePageInput,
): Promise<CreatedPage> {
  const { templateId, locale, slug, seoMeta, ...groupInput } = input;
  if (templateId && groupInput.content) {
    throw new Error('A page starts from content or from a template, not both');
  }
  const site = await placePageGroup(deps, input);
  site.assertLocaleEnabled(locale);
  const content: PageContent | undefined = templateId
    ? await pageTemplateStartingContent(
        deps.reusableSectionRepository,
        input.tenantId,
        input.siteId,
        templateId,
      )
    : groupInput.content;

  const { group, version } = await buildPageGroup(deps.pageGroupRepository, {
    ...groupInput,
    content,
  });

  await assertPageTranslationAddressFree(deps, {
    tenantId: input.tenantId,
    siteId: input.siteId,
    locale,
    parentGroupId: group.parentId,
    slug,
  });

  const translation = PageTranslation.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    pageGroupId: group.id,
    locale,
    slug,
    seoMeta,
    createdBy: input.createdBy,
  });

  await deps.pageGroupRepository.addWithTranslation(
    group,
    version,
    translation,
  );
  return { group, translation };
}
