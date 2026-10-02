import { loadTerm, type TaxonomyDeps } from './taxonomy-context';

export interface SetPageGroupTermsInput {
  tenantId: string;
  pageGroupId: string;
  termIds: string[];
}

/**
 * What a page is filed under, across every dimension at once — the whole
 * set, not a diff, because that is what the editor knows: the boxes that
 * are ticked.
 *
 * On the GROUP and not the translation: the Italian and the English
 * version of an article are the same article (docs/adr/0064).
 */
export async function setPageGroupTerms(
  deps: TaxonomyDeps,
  input: SetPageGroupTermsInput,
): Promise<string[]> {
  const unique = [...new Set(input.termIds)];
  for (const termId of unique) {
    await loadTerm(deps, input.tenantId, termId);
  }
  await deps.taxonomyRepository.setTermsForPageGroup(
    input.tenantId,
    input.pageGroupId,
    unique,
  );
  return unique;
}

export async function listPageGroupTerms(
  deps: TaxonomyDeps,
  tenantId: string,
  pageGroupId: string,
): Promise<string[]> {
  return deps.taxonomyRepository.listTermIdsForPageGroup(tenantId, pageGroupId);
}
