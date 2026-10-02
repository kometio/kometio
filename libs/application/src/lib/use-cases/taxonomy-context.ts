import {
  Taxonomy,
  TaxonomyNotFoundError,
  Term,
  TermNotFoundError,
} from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { type TermAddressDeps } from './term-address';
import { requireSite } from './require-site';

/**
 * What the taxonomy, term and page-classification use cases share: the
 * ports they read, and the three lookups that turn "not there" into the
 * right domain error. Most of what is built on it is load, mutate, save;
 * the parts that carry real policy — which addresses are free, whether a
 * move would make a term its own ancestor — live in `term-address.ts` and
 * in `assertNoCycle` (term.use-cases.ts), where they can be read on their
 * own.
 */
export interface TaxonomyDeps extends TermAddressDeps {
  siteRepository: SiteRepositoryPort;
}

export async function siteLocales(
  deps: TaxonomyDeps,
  tenantId: string,
  siteId: string,
): Promise<string[]> {
  const site = await requireSite(deps.siteRepository, tenantId, siteId);
  return site.enabledLocales;
}

export async function loadTaxonomy(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<Taxonomy> {
  const taxonomy = await deps.taxonomyRepository.findTaxonomyById(tenantId, id);
  if (!taxonomy) {
    throw new TaxonomyNotFoundError(id);
  }
  return taxonomy;
}

export async function loadTerm(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<Term> {
  const term = await deps.taxonomyRepository.findTermById(tenantId, id);
  if (!term) {
    throw new TermNotFoundError(id);
  }
  return term;
}
