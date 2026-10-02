import {
  PageSlugAlreadyExistsError,
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface RenamePageTranslationDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface RenamePageTranslationInput {
  tenantId: string;
  pageTranslationId: string;
  /** Already slugified by the caller — this decides an address, it does not invent one. */
  slug: string;
  parentGroupId: string | null;
  /** Recorded as the page's last editor — see EditContext in @kometio/domain-core. */
  actorUserId: string | null;
}

/**
 * Moves one language's page to a new address.
 *
 * Until this existed a slug was chosen once, at creation, from the title
 * the page was born with — so a typo, or a page whose subject changed,
 * kept its address for good, and the only way out was to delete the page
 * and lose its version history with it.
 *
 * The old address is not forgotten: `PageTranslation.updateSlug` records
 * it, and `resolvePageGroupByPath` answers there with a 301. That is the
 * difference between renaming and breaking every link somebody saved.
 *
 * Refuses a name a sibling already answers to. The database would refuse
 * it too — the unique index is the real guarantee — but a caller
 * deserves to hear which name is taken rather than a constraint
 * violation, and the check reads the same scope the index enforces.
 */
export async function renamePageTranslation(
  deps: RenamePageTranslationDeps,
  input: RenamePageTranslationInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  if (translation.slug === input.slug) {
    return translation;
  }

  const taken =
    await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
      input.tenantId,
      translation.siteId,
      translation.locale,
      input.parentGroupId,
      input.slug,
    );
  if (taken && taken.id !== translation.id) {
    throw new PageSlugAlreadyExistsError(input.slug);
  }

  translation.updateSlug(input.slug, { by: input.actorUserId });
  await deps.pageTranslationRepository.rename(translation);

  return translation;
}
