import {
  collectionRecordSchema,
  type CollectionRecord,
} from '@kometio/api-contracts';
import { request, send } from './http-client';
import { z } from 'zod';

export type { CollectionRecord };

/** The sections of the editor this site has — News, Events, Case studies. */
export async function listCollections(
  siteId: string,
): Promise<CollectionRecord[]> {
  return z
    .array(collectionRecordSchema)
    .parse(await request(`/collections?siteId=${encodeURIComponent(siteId)}`));
}

export interface CreateCollectionInput {
  siteId: string;
  name: string;
  icon?: string;
}

export async function createCollection(
  input: CreateCollectionInput,
): Promise<CollectionRecord> {
  return collectionRecordSchema.parse(
    await request('/collections', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function updateCollection(
  id: string,
  input: { name?: string; icon?: string; defaultTemplateId?: string | null },
): Promise<CollectionRecord> {
  return collectionRecordSchema.parse(
    await request(`/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export function deleteCollection(id: string): Promise<void> {
  return send(`/collections/${id}`, { method: 'DELETE' });
}
