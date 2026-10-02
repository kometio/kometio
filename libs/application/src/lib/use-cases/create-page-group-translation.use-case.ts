import { randomUUID } from 'node:crypto';
import {
  PageGroupNotFoundError,
  PageTranslation,
  PageTranslationLocaleAlreadyExistsError,
} from '@kometio/domain-core';
import type { SeoMeta } from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import { assertPageTranslationAddressFree } from './page-translation-address';
import { requireSite } from './require-site';

export interface CreatePageGroupTranslationDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  /**
   * Only to ask whether a taxonomy or one of its root-mounted terms
   * already answers at this address (docs/adr/0064) — the third of the
   * three places that rule has to hold, and the only one on the page
   * side.
   */
  taxonomyRepository: TaxonomyRepositoryPort;
  /** Only for the languages the site offers. */
  siteRepository: SiteRepositoryPort;
}

export interface CreatePageGroupTranslationInput {
  tenantId: string;
  pageGroupId: string;
  locale: string;
  slug: string;
  seoMeta: SeoMeta;
  createdBy: string | null;
}

/**
 * Adds one locale to an existing group — deliberately lightweight
 * (`fieldValues: {}`, no full content copy) compared to the old
 * createPageTranslation: the structure isn't this translation's to own
 * anymore, it lives on PageGroup and is inherited automatically.
 */
export async function createPageGroupTranslation(
  deps: CreatePageGroupTranslationDeps,
  input: CreatePageGroupTranslationInput,
): Promise<PageTranslation> {
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
  site.assertLocaleEnabled(input.locale);

  const existing = await deps.pageTranslationRepository.findByGroupAndLocale(
    input.tenantId,
    input.pageGroupId,
    input.locale,
  );
  if (existing) {
    throw new PageTranslationLocaleAlreadyExistsError(input.locale);
  }

  await assertPageTranslationAddressFree(deps, {
    tenantId: input.tenantId,
    siteId: group.siteId,
    locale: input.locale,
    parentGroupId: group.parentId,
    slug: input.slug,
  });

  const translation = PageTranslation.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: group.siteId,
    pageGroupId: group.id,
    locale: input.locale,
    slug: input.slug,
    seoMeta: input.seoMeta,
    createdBy: input.createdBy,
  });

  await deps.pageTranslationRepository.add(translation, group.parentId);

  return translation;
}
