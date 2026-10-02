import { z } from 'zod';
import {
  type LocalizedSeoMeta,
  type LocalizedText,
} from '@kometio/shared-types';
import {
  type PageGroupTerms,
  type TaxonomyRecord,
  type TermRecord,
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

export interface CreateTaxonomyInput {
  siteId: string;
  name: LocalizedText;
  /**
   * Absent = derive one from the name, `null` = mount the terms at the
   * site root. Three states, and the API can only tell them apart if the
   * key is genuinely absent — see the ADR-0064 note on the body schema.
   */
  prefix?: string | null;
  hierarchical?: boolean;
}

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

export interface UpdateTaxonomyInput {
  name?: LocalizedText;
  prefix?: string | null;
  hierarchical?: boolean;
}

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

export interface CreateTermInput {
  name: LocalizedText;
  slugs?: Record<string, string>;
  parentId?: string | null;
}

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

export interface UpdateTermInput {
  name?: LocalizedText;
  description?: LocalizedText;
  seoMeta?: LocalizedSeoMeta;
  noindex?: boolean;
  /** Replaces the whole map: a language left out loses its address. */
  slugs?: Record<string, string>;
  /** `null` detaches the landing page; the term's URL keeps working on the default layout. */
  landingPageGroupId?: string | null;
}

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
  return termRecordSchema.parse(
    await request(`/taxonomies/terms/${termId}/parent`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId }),
    }),
  );
}

export interface ReorderTermsInput {
  /** Whose children are put in order; `null` for the top of the dimension. */
  parentId: string | null;
  /** All of them, in the order wanted. */
  orderedTermIds: string[];
}

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
  return pageGroupTermsSchema.parse(
    await request(`/page-groups/${pageGroupId}/terms`, {
      method: 'PATCH',
      body: JSON.stringify({ termIds }),
    }),
  );
}
