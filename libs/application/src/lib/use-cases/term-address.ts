import {
  PageSlugCollidesWithTermError,
  TaxonomyPrefixAlreadyExistsError,
  TaxonomyPrefixReservedError,
  TermAddressCollidesWithPageError,
  TermAddressTakenError,
} from '@kometio/domain-core';
import { RESERVED_AUTHOR_PATH_SEGMENTS } from '@kometio/shared-types';
import type {
  PageTranslationRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';

/**
 * A term's path after the locale — `categoria/automatiche`, or just
 * `automatiche` for a dimension mounted at the site root.
 *
 * Flat on purpose (docs/adr/0064): the ancestors are not in the path, so
 * re-filing a term under a different parent never changes its address,
 * and an address never has to be repaired after a reorganisation.
 */
export function termAddress(prefix: string | null, slug: string): string {
  return prefix ? `${prefix}/${slug}` : slug;
}

export interface TermAddressDeps {
  taxonomyRepository: TaxonomyRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface TermAddressInput {
  tenantId: string;
  siteId: string;
  locale: string;
  prefix: string | null;
  slug: string;
  /** The term asking for the address, so re-saving one over itself is not a collision. */
  termId?: string;
}

/**
 * Refuses an address that is already answered — by another term, or by a
 * page.
 *
 * The term half the database also refuses (docs/adr/0064); it is checked
 * here so the answer can name what is in the way instead of surfacing a
 * constraint violation. The PAGE half has no constraint at all and never
 * can: terms and pages live in different tables and meet only in the
 * URL, so this is the only place that comparison ever happens.
 */
export async function assertTermAddressAvailable(
  deps: TermAddressDeps,
  input: TermAddressInput,
): Promise<void> {
  const occupant = await deps.taxonomyRepository.findTermByAddress(
    input.tenantId,
    input.siteId,
    input.locale,
    input.prefix,
    input.slug,
  );
  if (occupant && occupant.id !== input.termId) {
    throw new TermAddressTakenError(termAddress(input.prefix, input.slug));
  }

  // Only a ROOT-mounted term can land on a page's address: with a prefix
  // the collision would need a page at `/{locale}/{prefix}/...`, and no
  // page can be there because the prefix itself is refused as a root
  // page slug by `assertTaxonomyPrefixAvailable`.
  if (input.prefix !== null) return;

  const page =
    await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
      input.tenantId,
      input.siteId,
      input.locale,
      null,
      input.slug,
    );
  if (page) {
    throw new TermAddressCollidesWithPageError(input.slug);
  }
}

export interface TaxonomyPrefixInput {
  tenantId: string;
  siteId: string;
  prefix: string | null;
  /** The taxonomy asking, so saving one over itself is not a collision. */
  taxonomyId?: string;
  /** Every language the site publishes — a prefix has to be free in all of them, since it is the same string in each. */
  locales: string[];
}

/**
 * Refuses a prefix another dimension already uses, or one a root page
 * already answers to.
 *
 * A `null` prefix is never refused: mounting several dimensions at the
 * site root is deliberate (docs/adr/0064), and what keeps their terms
 * apart is the address check above.
 */
export async function assertTaxonomyPrefixAvailable(
  deps: TermAddressDeps,
  input: TaxonomyPrefixInput,
): Promise<void> {
  if (input.prefix === null) return;
  // Its terms would sit at the authors' addresses — `/it/autore/giulia` a
  // term and a person at once — and on every site at once, whatever
  // languages it publishes, since a prefix is one word for all of them.
  if (RESERVED_AUTHOR_PATH_SEGMENTS.has(input.prefix)) {
    throw new TaxonomyPrefixReservedError(input.prefix);
  }

  const existing = await deps.taxonomyRepository.listTaxonomiesBySite(
    input.tenantId,
    input.siteId,
  );
  if (
    existing.some(
      (taxonomy) =>
        taxonomy.prefix === input.prefix && taxonomy.id !== input.taxonomyId,
    )
  ) {
    throw new TaxonomyPrefixAlreadyExistsError(input.prefix);
  }

  for (const locale of input.locales) {
    const page =
      await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
        input.tenantId,
        input.siteId,
        locale,
        null,
        input.prefix,
      );
    if (page) {
      throw new TermAddressCollidesWithPageError(input.prefix);
    }
  }
}

export interface PageSlugInput {
  tenantId: string;
  siteId: string;
  locale: string;
  slug: string;
}

/**
 * The third place the rule has to hold: a ROOT page cannot be created on
 * an address a dimension or one of its root-mounted terms already
 * answers.
 *
 * Without this the check is only half a rule — terms would refuse to
 * land on pages while pages happily landed on terms, and the loser would
 * be whichever one the router happens to try second.
 */
export async function assertPageSlugFreeOfTerms(
  deps: TermAddressDeps,
  input: PageSlugInput,
): Promise<void> {
  const taxonomies = await deps.taxonomyRepository.listTaxonomiesBySite(
    input.tenantId,
    input.siteId,
  );
  if (taxonomies.some((taxonomy) => taxonomy.prefix === input.slug)) {
    throw new PageSlugCollidesWithTermError(input.slug);
  }

  const term = await deps.taxonomyRepository.findTermByAddress(
    input.tenantId,
    input.siteId,
    input.locale,
    null,
    input.slug,
  );
  if (term) {
    throw new PageSlugCollidesWithTermError(input.slug);
  }
}
