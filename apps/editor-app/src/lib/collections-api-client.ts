import {
  collectionRecordSchema,
  type CollectionRecord,
  type CreateCollectionBody,
  type UpdateCollectionBody,
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

export type CreateCollectionInput = CreateCollectionBody;

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
  input: UpdateCollectionBody,
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
