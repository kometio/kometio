import { z } from 'zod';
import {
  type CreateTaxonomyBody,
  type CreateTermBody,
  type MoveTermBody,
  type PageGroupTerms,
  type PageGroupTermsBody,
  type ReorderTermsBody,
  type TaxonomyRecord,
  type TermRecord,
  type UpdateTaxonomyBody,
  type UpdateTermBody,
  pageGroupTermsSchema,
  taxonomyRecordSchema,
  termRecordSchema,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type { TaxonomyRecord, TermRecord };

export async function listTaxonomies(
  siteId: string,
): Promise<TaxonomyRecord[]> {
  const params = new URLSearchParams({ siteId });
  return z
    .array(taxonomyRecordSchema)
    .parse(await request(`/taxonomies?${params.toString()}`));
}

export async function listTerms(taxonomyId: string): Promise<TermRecord[]> {
  return z
    .array(termRecordSchema)
    .parse(await request(`/taxonomies/${taxonomyId}/terms`));
}

/**
 * `prefix`: absent = derive one from the name, `null` = mount the terms at
 * the site root. Three states, and the API can only tell them apart if the
 * key is genuinely absent — see the ADR-0064 note on the body schema.
 */
export type CreateTaxonomyInput = CreateTaxonomyBody;

export async function createTaxonomy(
  input: CreateTaxonomyInput,
): Promise<TaxonomyRecord> {
  return taxonomyRecordSchema.parse(
    await request('/taxonomies', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export type UpdateTaxonomyInput = UpdateTaxonomyBody;

export async function updateTaxonomy(
  id: string,
  input: UpdateTaxonomyInput,
): Promise<TaxonomyRecord> {
  return taxonomyRecordSchema.parse(
    await request(`/taxonomies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export function deleteTaxonomy(id: string): Promise<void> {
  return send(`/taxonomies/${id}`, { method: 'DELETE' });
}

export type CreateTermInput = CreateTermBody;

export async function createTerm(
  taxonomyId: string,
  input: CreateTermInput,
): Promise<TermRecord> {
  return termRecordSchema.parse(
    await request(`/taxonomies/${taxonomyId}/terms`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * `slugs` replaces the whole map: a language left out loses its address.
 * `landingPageGroupId: null` detaches the landing page; the term's URL keeps
 * working on the default layout.
 */
export type UpdateTermInput = UpdateTermBody;

export async function updateTerm(
  termId: string,
  input: UpdateTermInput,
): Promise<TermRecord> {
  return termRecordSchema.parse(
    await request(`/taxonomies/terms/${termId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export async function moveTerm(
  termId: string,
  parentId: string | null,
): Promise<TermRecord> {
  const body: MoveTermBody = { parentId };
  return termRecordSchema.parse(
    await request(`/taxonomies/terms/${termId}/parent`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

/** `parentId`: whose children are put in order, `null` for the top of the dimension; `orderedTermIds`: all of them, in the order wanted. */
export type ReorderTermsInput = ReorderTermsBody;

/** The terms that share one parent, put in order in one call; answers with the dimension's terms as they now read. */
export async function reorderTerms(
  taxonomyId: string,
  input: ReorderTermsInput,
): Promise<TermRecord[]> {
  return z.array(termRecordSchema).parse(
    await request(`/taxonomies/${taxonomyId}/terms/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export function deleteTerm(termId: string): Promise<void> {
  return send(`/taxonomies/terms/${termId}`, { method: 'DELETE' });
}

/** Which terms a page carries — on the page GROUP, so it is the same set in every language (ADR-0064). */
export async function getPageGroupTerms(
  pageGroupId: string,
): Promise<PageGroupTerms> {
  return pageGroupTermsSchema.parse(
    await request(`/page-groups/${pageGroupId}/terms`),
  );
}

export async function setPageGroupTerms(
  pageGroupId: string,
  termIds: string[],
): Promise<PageGroupTerms> {
  const body: PageGroupTermsBody = { termIds };
  return pageGroupTermsSchema.parse(
    await request(`/page-groups/${pageGroupId}/terms`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}
