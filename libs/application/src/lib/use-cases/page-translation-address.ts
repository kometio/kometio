import { PageSlugAlreadyExistsError } from '@kometio/domain-core';
import type {
  PageTranslationRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import { assertPageSlugFreeOfTerms } from './term-address';

export interface PageTranslationAddressDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** Only for a root address, which a taxonomy or a root-mounted term may already answer (docs/adr/0064). */
  taxonomyRepository: TaxonomyRepositoryPort;
}

export interface PageTranslationAddress {
  tenantId: string;
  siteId: string;
  locale: string;
  /** The group the new language hangs under — `null` at the root. */
  parentGroupId: string | null;
  slug: string;
}

/**
 * Refuses an address a sibling page already answers in this language, or —
 * at the root — a dimension or a root-mounted term does.
 *
 * The database refuses a sibling's slug anyway; this is here so the refusal
 * names the address, and so a use case that writes several rows at once can
 * refuse before writing any of them.
 */
export async function assertPageTranslationAddressFree(
  deps: PageTranslationAddressDeps,
  address: PageTranslationAddress,
): Promise<void> {
  const taken =
    await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
      address.tenantId,
      address.siteId,
      address.locale,
      address.parentGroupId,
      address.slug,
    );
  if (taken) {
    throw new PageSlugAlreadyExistsError(address.slug);
  }

  // Only at the root: a nested page's address begins with its ancestors'
  // slugs, and no term can be there — a taxonomy prefix is refused as a
  // root page slug in the first place, so nothing can own that first
  // segment except a page.
  if (address.parentGroupId === null) {
    await assertPageSlugFreeOfTerms(
      {
        taxonomyRepository: deps.taxonomyRepository,
        pageTranslationRepository: deps.pageTranslationRepository,
      },
      {
        tenantId: address.tenantId,
        siteId: address.siteId,
        locale: address.locale,
        slug: address.slug,
      },
    );
  }
}
