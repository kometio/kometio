import {
  type Block,
  type FieldValueOverlay,
  type PageListState,
  type SeoMeta,
} from '@kometio/shared-types';
import {
  paginatedPageGroupsSchema,
  pageGroupRecordSchema,
  pageGroupVersionRecordSchema,
  pageTranslationRecordSchema,
  pageTranslationVersionRecordSchema,
  type PageGroupListItemRecord,
  type PageGroupRecord,
  type PageGroupVersionRecord,
  type PageTranslationRecord,
  type PageTranslationVersionRecord,
  type PaginatedPageGroups,
  type ReusableSectionRecord,
  reusableSectionRecordSchema,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type {
  PageGroupListItemRecord,
  PageGroupRecord,
  PageGroupVersionRecord,
  PageTranslationRecord,
  PageTranslationVersionRecord,
  PaginatedPageGroups,
};

async function requestGroup(
  path: string,
  init?: RequestInit,
): Promise<PageGroupRecord> {
  return pageGroupRecordSchema.parse(await request(path, init));
}

async function requestTranslation(
  path: string,
  init?: RequestInit,
): Promise<PageTranslationRecord> {
  return pageTranslationRecordSchema.parse(await request(path, init));
}

export function getPageGroup(id: string): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}`);
}

export interface CreatePageGroupInput {
  siteId: string;
  parentId?: string | null;
  /** Which section of the editor it is being created from — see the Collection entity. */
  collectionId?: string | null;
  content?: Block[];
  /** Start from a copy of this template's published blocks instead — never together with `content` (docs/adr/0072). */
  templateId?: string;
  /** The first language, written in the same transaction as the page — required with `templateId`. */
  translation?: {
    locale: string;
    slug: string;
    seoMeta: SeoMeta;
  };
}

export function createPageGroup(
  input: CreatePageGroupInput,
): Promise<PageGroupRecord> {
  return requestGroup('/page-groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface ListPageGroupsFilters {
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  createdBy?: string;
  locale?: string;
  /** `'none'` asks for the pages that belong to no section — see the Collection entity. */
  collection?: 'none' | string;
  /** Leaves out this page and everything under it — the parent picker's, since a page cannot move inside its own child. */
  excludeSubtreeOf?: string;
  /** Only the pages in this state, as the list row shows it (the server judges the same language). */
  status?: PageListState;
}

export async function listPageGroups(
  siteId: string,
  page: number,
  pageSize: number,
  filters: ListPageGroupsFilters = {},
): Promise<PaginatedPageGroups> {
  const params = new URLSearchParams({
    siteId,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.createdAfter) {
    params.set('createdAfter', filters.createdAfter.toISOString());
  }
  if (filters.createdBefore) {
    params.set('createdBefore', filters.createdBefore.toISOString());
  }
  if (filters.createdBy) params.set('createdBy', filters.createdBy);
  if (filters.locale) params.set('locale', filters.locale);
  if (filters.collection) params.set('collection', filters.collection);
  if (filters.status) params.set('status', filters.status);
  if (filters.excludeSubtreeOf) {
    params.set('excludeSubtreeOf', filters.excludeSubtreeOf);
  }
  return paginatedPageGroupsSchema.parse(
    await request(`/page-groups?${params.toString()}`),
  );
}

export function movePageGroupToCollection(
  id: string,
  collectionId: string | null,
): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}/collection`, {
    method: 'PATCH',
    body: JSON.stringify({ collectionId }),
  });
}

/** Where the page hangs in the site's tree — its address, and the address of everything under it (docs/adr/0074). */
export function movePageGroupToParent(
  id: string,
  parentId: string | null,
): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}/parent`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId }),
  });
}

export function savePageGroupContent(
  id: string,
  content: Block[],
): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}/content`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deletePageGroup(id: string): Promise<void> {
  return send(`/page-groups/${id}`, { method: 'DELETE' });
}

export function reorderPageGroups(
  siteId: string,
  parentId: string | null,
  orderedPageGroupIds: string[],
): Promise<void> {
  return send('/page-groups/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ siteId, parentId, orderedPageGroupIds }),
  });
}

/**
 * A published template holding what this page shows in the site's default
 * language (docs/adr/0072). Answered with the template itself, in the shape
 * the sections list reads.
 */
export async function savePageGroupAsTemplate(
  id: string,
  name: string,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/page-groups/${id}/save-as-template`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
}

export function duplicatePageGroup(id: string): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}/duplicate`, { method: 'POST' });
}

export function rollbackPageGroupToVersion(
  id: string,
  versionId: string,
): Promise<PageGroupRecord> {
  return requestGroup(`/page-groups/${id}/rollback`, {
    method: 'PATCH',
    body: JSON.stringify({ versionId }),
  });
}

export async function listPageGroupVersions(
  groupId: string,
): Promise<PageGroupVersionRecord[]> {
  const versions = await request(`/page-groups/${groupId}/versions`);
  return pageGroupVersionRecordSchema.array().parse(versions);
}

export async function listPageGroupTranslations(
  groupId: string,
): Promise<PageTranslationRecord[]> {
  const translations = await request(`/page-groups/${groupId}/translations`);
  return pageTranslationRecordSchema.array().parse(translations);
}

export interface CreatePageGroupTranslationInput {
  locale: string;
  slug: string;
  seoMeta: SeoMeta;
}

export function createPageGroupTranslation(
  groupId: string,
  input: CreatePageGroupTranslationInput,
): Promise<PageTranslationRecord> {
  return requestTranslation(`/page-groups/${groupId}/translations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function savePageTranslationFieldValues(
  translationId: string,
  fieldValues: FieldValueOverlay,
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/field-values`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fieldValues }),
    },
  );
}

export function saveDivergedPageTranslationContent(
  translationId: string,
  content: Block[],
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/diverged-content`,
    {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    },
  );
}

export function updatePageTranslationSeoMeta(
  translationId: string,
  seoMeta: SeoMeta,
): Promise<PageTranslationRecord> {
  return requestTranslation(`/page-groups/translations/${translationId}/seo`, {
    method: 'PATCH',
    body: JSON.stringify({ seoMeta }),
  });
}

/**
 * Moves this language's page to a new address, leaving a 301 behind at
 * the old one. Rejects with the API's message when a sibling already
 * answers there.
 */
export function renamePageTranslation(
  translationId: string,
  slug: string,
  parentGroupId: string | null,
): Promise<PageTranslationRecord> {
  return requestTranslation(`/page-groups/translations/${translationId}/slug`, {
    method: 'PATCH',
    body: JSON.stringify({ slug, parentGroupId }),
  });
}

export function publishPageTranslation(
  translationId: string,
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/publish`,
    { method: 'POST' },
  );
}

export function divergePageTranslation(
  translationId: string,
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/diverge`,
    { method: 'POST' },
  );
}

/**
 * Brings an unlinked language back onto the shared structure, with
 * `fieldValues` as its text — `relinkedOverlay` over its fork.
 */
export function relinkPageTranslation(
  translationId: string,
  fieldValues: FieldValueOverlay,
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/relink`,
    { method: 'POST', body: JSON.stringify({ fieldValues }) },
  );
}

export function rollbackPageTranslationToVersion(
  translationId: string,
  versionId: string,
): Promise<PageTranslationRecord> {
  return requestTranslation(
    `/page-groups/translations/${translationId}/rollback`,
    { method: 'PATCH', body: JSON.stringify({ versionId }) },
  );
}

export async function listPageTranslationVersions(
  translationId: string,
): Promise<PageTranslationVersionRecord[]> {
  const versions = await request(
    `/page-groups/translations/${translationId}/versions`,
  );
  return pageTranslationVersionRecordSchema.array().parse(versions);
}
