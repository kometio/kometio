import { randomUUID } from 'node:crypto';
import { Collection, CollectionNotFoundError } from '@kometio/domain-core';
import type {
  CollectionRepositoryPort,
  ReusableSectionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { assertPageTemplate } from './page-template.use-cases';
import { requireSite } from './require-site';

export interface CollectionDeps {
  collectionRepository: CollectionRepositoryPort;
}

export interface CreateCollectionDeps extends CollectionDeps {
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface CreateCollectionInput {
  tenantId: string;
  siteId: string;
  name: string;
  icon?: string;
}

/**
 * The four things you can do to a section of the editor, in one file:
 * they are the whole surface, none of them coordinates anything, and a
 * file each would be four files of six lines.
 */
export async function createCollection(
  deps: CreateCollectionDeps,
  input: CreateCollectionInput,
): Promise<Collection> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  const existing = await deps.collectionRepository.listBySite(
    input.tenantId,
    input.siteId,
  );
  const collection = Collection.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    name: input.name,
    icon: input.icon,
    // Appended, not prepended: a new section goes at the bottom of the
    // sidebar, where adding one does not move the entries somebody has
    // learned the position of.
    order: Math.max(-1, ...existing.map((one) => one.order)) + 1,
  });
  await deps.collectionRepository.add(collection);
  return collection;
}

export function listCollections(
  deps: CollectionDeps,
  tenantId: string,
  siteId: string,
): Promise<Collection[]> {
  return deps.collectionRepository.listBySite(tenantId, siteId);
}

export interface UpdateCollectionDeps extends CollectionDeps {
  /** Only to check that a default template is one a page of this site can start from. */
  reusableSectionRepository: ReusableSectionRepositoryPort;
}

export interface UpdateCollectionInput {
  tenantId: string;
  collectionId: string;
  name?: string;
  icon?: string;
  /** `null` clears it; left out, it stays as it is. */
  defaultTemplateId?: string | null;
}

export async function updateCollection(
  deps: UpdateCollectionDeps,
  input: UpdateCollectionInput,
): Promise<Collection> {
  const collection = await deps.collectionRepository.findById(
    input.tenantId,
    input.collectionId,
  );
  if (!collection) {
    throw new CollectionNotFoundError(input.collectionId);
  }
  if (input.name !== undefined) collection.rename(input.name);
  if (input.icon !== undefined) collection.changeIcon(input.icon);
  if (input.defaultTemplateId !== undefined) {
    // Checked when it is set, not only when it is used: a default the
    // New page dialog cannot offer — a shared section, a draft, another
    // site's — would be preselected as nothing, silently.
    if (input.defaultTemplateId !== null) {
      await assertPageTemplate(
        deps.reusableSectionRepository,
        input.tenantId,
        collection.siteId,
        input.defaultTemplateId,
      );
    }
    collection.setDefaultTemplate(input.defaultTemplateId);
  }
  await deps.collectionRepository.save(collection);
  return collection;
}

/**
 * Removes the section. What it held stays: the column pointing here is
 * `on delete set null`, so its pages become ordinary pages and appear
 * back under Pages. Deleting a shelf is not deleting the books.
 */
export async function deleteCollection(
  deps: CollectionDeps,
  tenantId: string,
  collectionId: string,
): Promise<void> {
  const collection = await deps.collectionRepository.findById(
    tenantId,
    collectionId,
  );
  if (!collection) {
    throw new CollectionNotFoundError(collectionId);
  }
  await deps.collectionRepository.delete(tenantId, collectionId);
}
