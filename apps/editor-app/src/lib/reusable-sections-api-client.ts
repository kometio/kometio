import { z } from 'zod';
import {
  type Block,
  type ExposedFields,
  type ReusableSectionKind,
} from '@kometio/shared-types';
import {
  type ReusableSectionListItem,
  type ReusableSectionRecord,
  type ReusableSectionVersionRecord,
  reusableSectionListItemSchema,
  reusableSectionRecordSchema,
  reusableSectionVersionRecordSchema,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type {
  ReusableSectionKind,
  ReusableSectionListItem,
  ReusableSectionRecord,
  ReusableSectionVersionRecord,
};

export async function listReusableSections(
  siteId: string,
): Promise<ReusableSectionListItem[]> {
  const params = new URLSearchParams({ siteId });
  return z
    .array(reusableSectionListItemSchema)
    .parse(await request(`/reusable-sections?${params.toString()}`));
}

export async function getReusableSection(
  id: string,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}`),
  );
}

export async function createReusableSection(input: {
  siteId: string;
  name: string;
  kind: ReusableSectionKind;
  content?: Block[];
}): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request('/reusable-sections', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function saveDraft(
  id: string,
  content: Block[],
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  );
}

export async function renameReusableSection(
  id: string,
  name: string,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  );
}

/**
 * Which fields an instance may change. Its own endpoint, not part of the
 * draft: it is a rule about editing rather than content, so it takes
 * effect without republishing — the same separation `sticky` has on a
 * header (docs/adr/0018 follow-up).
 */
export async function setExposedFields(
  id: string,
  exposedFields: ExposedFields,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}/exposed-fields`, {
      method: 'PATCH',
      body: JSON.stringify({ exposedFields }),
    }),
  );
}

export async function publishReusableSection(
  id: string,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}/publish`, { method: 'POST' }),
  );
}

export function deleteReusableSection(id: string): Promise<void> {
  return send(`/reusable-sections/${id}`, { method: 'DELETE' });
}

export async function listVersions(
  id: string,
): Promise<ReusableSectionVersionRecord[]> {
  return z
    .array(reusableSectionVersionRecordSchema)
    .parse(await request(`/reusable-sections/${id}/versions`));
}

export async function rollbackToVersion(
  id: string,
  versionId: string,
): Promise<ReusableSectionRecord> {
  return reusableSectionRecordSchema.parse(
    await request(`/reusable-sections/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  );
}
