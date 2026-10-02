import { z } from 'zod';
import { type Block, type SiteLayoutSectionKind } from '@kometio/shared-types';
import {
  type SiteLayoutSectionRecord,
  type SiteLayoutSectionVersionRecord,
  siteLayoutSectionRecordSchema,
  siteLayoutSectionVersionRecordSchema,
} from '@kometio/api-contracts';
import { request } from './http-client';

export type {
  SiteLayoutSectionKind,
  SiteLayoutSectionRecord,
  SiteLayoutSectionVersionRecord,
};

// Always creates the row implicitly the first time it's called for a given
// (site, locale, kind) — see getOrCreateSiteLayoutSection (docs/adr/0018),
// so the editor never has to handle a "doesn't exist yet" state.
export async function getOrCreateSiteLayoutSection(
  siteId: string,
  locale: string,
  kind: SiteLayoutSectionKind,
): Promise<SiteLayoutSectionRecord> {
  const params = new URLSearchParams({ siteId, locale, kind });
  return siteLayoutSectionRecordSchema.parse(
    await request(`/site-layout-sections?${params.toString()}`),
  );
}

export async function saveDraft(
  id: string,
  content: Block[],
): Promise<SiteLayoutSectionRecord> {
  return siteLayoutSectionRecordSchema.parse(
    await request(`/site-layout-sections/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  );
}

export async function publishSiteLayoutSection(
  id: string,
): Promise<SiteLayoutSectionRecord> {
  return siteLayoutSectionRecordSchema.parse(
    await request(`/site-layout-sections/${id}/publish`, { method: 'POST' }),
  );
}

// Not part of content/draft-publish (docs/adr/0018 follow-up) — a display
// setting that takes effect immediately, so it's its own endpoint rather
// than folded into saveDraft's body.
export async function updateSticky(
  id: string,
  sticky: boolean,
): Promise<SiteLayoutSectionRecord> {
  return siteLayoutSectionRecordSchema.parse(
    await request(`/site-layout-sections/${id}/sticky`, {
      method: 'PATCH',
      body: JSON.stringify({ sticky }),
    }),
  );
}

export async function listVersions(
  id: string,
): Promise<SiteLayoutSectionVersionRecord[]> {
  return z
    .array(siteLayoutSectionVersionRecordSchema)
    .parse(await request(`/site-layout-sections/${id}/versions`));
}

export async function rollbackToVersion(
  id: string,
  versionId: string,
): Promise<SiteLayoutSectionRecord> {
  return siteLayoutSectionRecordSchema.parse(
    await request(`/site-layout-sections/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  );
}
