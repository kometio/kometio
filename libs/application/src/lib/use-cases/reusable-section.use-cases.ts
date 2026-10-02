import { randomUUID } from 'node:crypto';
import {
  ReusableSection,
  ReusableSectionNameAlreadyExistsError,
  ReusableSectionNotFoundError,
  ReusableSectionVersionNotFoundError,
  type ReusableSectionVersion,
} from '@kometio/domain-core';
import type {
  ExposedFields,
  PageContent,
  ReusableSectionKind,
} from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { collectSectionReferences } from '@kometio/shared-types';
import { requireSite } from './require-site';

export interface ReusableSectionDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
  reusableSectionVersionRepository: ReusableSectionVersionRepositoryPort;
}

/**
 * The section CRUD, kept in one file rather than one file per verb.
 *
 * The layout-section use cases are one file each, and that shape earns its
 * keep when each one carries real policy — publishing a page decides what
 * to freeze, creating a translation decides what to copy. These do not:
 * seven of them are load, mutate, save, and the interesting logic
 * (resolution at render, re-indexing on publish) lives in the two modules
 * next to this one that actually hold it. Seven files whose bodies are
 * four lines would spread one small thing over seven places to read.
 */

async function load(
  deps: ReusableSectionDeps,
  tenantId: string,
  id: string,
): Promise<ReusableSection> {
  const section = await deps.reusableSectionRepository.findById(tenantId, id);
  if (!section) {
    throw new ReusableSectionNotFoundError(id);
  }
  return section;
}

/**
 * Every write to the draft also writes a version — the same invariant the
 * pages and the header hold: a save is never a destructive overwrite.
 * Called right after the section itself is added or saved.
 */
async function recordVersion(
  deps: ReusableSectionDeps,
  section: ReusableSection,
  actorUserId: string | null,
): Promise<ReusableSection> {
  await deps.reusableSectionVersionRepository.save({
    id: randomUUID(),
    tenantId: section.tenantId,
    reusableSectionId: section.id,
    content: section.content,
    createdBy: actorUserId,
    createdAt: section.updatedAt,
  });
  return section;
}

export interface CreateReusableSectionInput {
  tenantId: string;
  siteId: string;
  name: string;
  kind: ReusableSectionKind;
  /** The blocks it starts from — how "turn this strip into a section" arrives here. */
  content?: PageContent;
  /**
   * Written already published, in the same save that creates it. For a
   * section nothing references yet, so publishing re-indexes nothing — and
   * a separate publish that failed would leave a draft holding the name,
   * which a retry then finds taken.
   */
  published?: boolean;
  actorUserId: string | null;
}

export async function createReusableSection(
  deps: ReusableSectionDeps & {
    siteRepository: Pick<SiteRepositoryPort, 'findById'>;
  },
  input: CreateReusableSectionInput,
): Promise<ReusableSection> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  // Checked here as well as by the unique constraint, so the person gets
  // "that name is taken" in the common case. The constraint stays: this
  // check races, and the database does not — the repository turns what
  // it refuses into the same error.
  const existing = await deps.reusableSectionRepository.listBySite(
    input.tenantId,
    input.siteId,
  );
  if (existing.some((section) => section.name === input.name)) {
    throw new ReusableSectionNameAlreadyExistsError(input.name);
  }

  const section = ReusableSection.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    name: input.name,
    kind: input.kind,
    content: input.content,
    createdBy: input.actorUserId,
  });
  if (input.published) {
    section.publish();
  }
  await deps.reusableSectionRepository.add(section);
  return recordVersion(deps, section, input.actorUserId);
}

export async function listReusableSections(
  deps: ReusableSectionDeps,
  tenantId: string,
  siteId: string,
): Promise<ReusableSection[]> {
  return deps.reusableSectionRepository.listBySite(tenantId, siteId);
}

export interface ReusableSectionWithUsage {
  section: ReusableSection;
  /** How many pages place this section. Always 0 for a template — see below. */
  usedOnPages: number;
  /**
   * How many templates hold this section (docs/adr/0072). Every page made
   * from one of them will place it too, so deleting it takes a strip out of
   * pages that do not exist yet — which the page count alone cannot say.
   */
  usedInTemplates: number;
}

/**
 * The list, with the one number an author needs before renaming or
 * deleting a section: how many pages it is on.
 *
 * Counted with `collectSectionReferences`, the same function the renderer
 * uses, over every page group's canonical content in one query. One
 * question, one answer — not one for rendering and a subtly different one
 * for the list.
 *
 * A `template` always counts 0, and that is not a gap: inserting one
 * copies its blocks and leaves nothing pointing back, so there is nothing
 * to count. Reporting a number there would suggest a link that does not
 * exist.
 *
 * The templates that hold a section are counted apart, over both their
 * draft and their published blocks: a template is where a section is placed
 * for pages still to come, and that is part of "where is this used".
 */
export async function listReusableSectionsWithUsage(
  deps: ReusableSectionDeps & {
    pageGroupRepository: PageGroupRepositoryPort;
  },
  tenantId: string,
  siteId: string,
): Promise<ReusableSectionWithUsage[]> {
  const sections = await deps.reusableSectionRepository.listBySite(
    tenantId,
    siteId,
  );
  if (sections.length === 0) {
    return [];
  }
  const groups = await deps.pageGroupRepository.listContentBySite(
    tenantId,
    siteId,
  );
  const usage = new Map<string, number>();
  for (const group of groups) {
    for (const sectionId of collectSectionReferences([group.content])) {
      usage.set(sectionId, (usage.get(sectionId) ?? 0) + 1);
    }
  }
  const inTemplates = new Map<string, number>();
  for (const template of sections) {
    if (template.kind !== 'template') {
      continue;
    }
    const references = collectSectionReferences([
      template.content,
      template.publishedContent ?? [],
    ]);
    for (const sectionId of references) {
      inTemplates.set(sectionId, (inTemplates.get(sectionId) ?? 0) + 1);
    }
  }
  return sections.map((section) => ({
    section,
    usedOnPages: usage.get(section.id) ?? 0,
    usedInTemplates: inTemplates.get(section.id) ?? 0,
  }));
}

export async function getReusableSection(
  deps: ReusableSectionDeps,
  tenantId: string,
  id: string,
): Promise<ReusableSection> {
  return load(deps, tenantId, id);
}

export interface SaveReusableSectionDraftInput {
  tenantId: string;
  id: string;
  content: PageContent;
  actorUserId: string | null;
}

export async function saveReusableSectionDraft(
  deps: ReusableSectionDeps,
  input: SaveReusableSectionDraftInput,
): Promise<ReusableSection> {
  const section = await load(deps, input.tenantId, input.id);
  section.saveDraft(input.content);
  await deps.reusableSectionRepository.save(section);
  return recordVersion(deps, section, input.actorUserId);
}

export interface RenameReusableSectionInput {
  tenantId: string;
  id: string;
  name: string;
}

export async function renameReusableSection(
  deps: ReusableSectionDeps,
  input: RenameReusableSectionInput,
): Promise<ReusableSection> {
  const section = await load(deps, input.tenantId, input.id);
  const siblings = await deps.reusableSectionRepository.listBySite(
    input.tenantId,
    section.siteId,
  );
  if (
    siblings.some(
      (other) => other.id !== section.id && other.name === input.name,
    )
  ) {
    throw new ReusableSectionNameAlreadyExistsError(input.name);
  }
  section.rename(input.name);
  // No version row: a name is not content, so restoring an old version
  // must not silently rename the section back.
  await deps.reusableSectionRepository.save(section);
  return section;
}

export interface SetExposedFieldsInput {
  tenantId: string;
  id: string;
  exposedFields: ExposedFields;
}

export async function setReusableSectionExposedFields(
  deps: ReusableSectionDeps,
  input: SetExposedFieldsInput,
): Promise<ReusableSection> {
  const section = await load(deps, input.tenantId, input.id);
  section.setExposedFields(input.exposedFields);
  // Not versioned and not published, for the reason on the entity: it is a
  // rule about who may edit what, not content, and unlocking one more
  // field should not require republishing the section.
  await deps.reusableSectionRepository.save(section);
  return section;
}

export async function deleteReusableSection(
  deps: ReusableSectionDeps,
  tenantId: string,
  id: string,
): Promise<void> {
  await load(deps, tenantId, id);
  // The pages referencing it are deliberately left alone. Rewriting every
  // page that used a deleted section would be a destructive edit made on
  // the user's behalf, across pages they are not looking at; an instance
  // whose section is gone renders as an empty strip (see
  // `resolveSectionBlocks`) and stays visible in the editor, where it can
  // be removed or pointed at another section on purpose.
  await deps.reusableSectionRepository.delete(tenantId, id);
}

export async function listReusableSectionVersions(
  deps: ReusableSectionDeps,
  tenantId: string,
  id: string,
): Promise<ReusableSectionVersion[]> {
  await load(deps, tenantId, id);
  return deps.reusableSectionVersionRepository.listBySection(tenantId, id);
}

export interface RollbackReusableSectionInput {
  tenantId: string;
  id: string;
  versionId: string;
  actorUserId: string | null;
}

/**
 * Restores the draft to an older version. It does NOT republish — the same
 * invariant the pages and the header hold, and it matters more here: a
 * rollback that published itself would change every page using the section
 * the instant it was clicked.
 */
export async function rollbackReusableSectionToVersion(
  deps: ReusableSectionDeps,
  input: RollbackReusableSectionInput,
): Promise<ReusableSection> {
  const section = await load(deps, input.tenantId, input.id);
  const version = await deps.reusableSectionVersionRepository.findById(
    input.tenantId,
    input.versionId,
  );
  if (!version || version.reusableSectionId !== section.id) {
    throw new ReusableSectionVersionNotFoundError(input.versionId);
  }
  section.restoreContent(version.content);
  await deps.reusableSectionRepository.save(section);
  return recordVersion(deps, section, input.actorUserId);
}
