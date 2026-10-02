import { randomUUID } from 'node:crypto';
import { Taxonomy, TaxonomyNotHierarchicalError } from '@kometio/domain-core';
import type { LocalizedText } from '@kometio/shared-types';
import { slugify } from '@kometio/shared-types';
import { assertTaxonomyPrefixAvailable } from './term-address';
import {
  loadTaxonomy,
  siteLocales,
  type TaxonomyDeps,
} from './taxonomy-context';

export interface CreateTaxonomyInput {
  tenantId: string;
  siteId: string;
  name: LocalizedText;
  /** `null` mounts its terms at the site root. Absent means "derive one from the name", which is what the editor sends. */
  prefix?: string | null;
  hierarchical?: boolean;
}

export async function createTaxonomy(
  deps: TaxonomyDeps,
  input: CreateTaxonomyInput,
): Promise<Taxonomy> {
  const prefix =
    input.prefix === undefined
      ? defaultPrefixFrom(input.name)
      : normalizePrefix(input.prefix);
  await assertTaxonomyPrefixAvailable(deps, {
    tenantId: input.tenantId,
    siteId: input.siteId,
    prefix,
    locales: await siteLocales(deps, input.tenantId, input.siteId),
  });

  const taxonomy = Taxonomy.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    prefix,
    name: input.name,
    hierarchical: input.hierarchical,
  });
  await deps.taxonomyRepository.addTaxonomy(taxonomy);
  return taxonomy;
}

/**
 * A prefix is a URL segment, so it goes through the same `slugify` a
 * page's does — a dimension called "Categoria prodotti" must not put a
 * space in every one of its terms' addresses. An empty result is `null`
 * rather than an empty segment, which would produce `/it//espresso`.
 */
function normalizePrefix(prefix: string | null): string | null {
  if (prefix === null) return null;
  const slug = slugify(prefix);
  return slug === '' ? null : slug;
}

/** The name in whatever language it was given in — the prefix is one string for every locale, so the first one there is is as good as any. */
function defaultPrefixFrom(name: LocalizedText): string | null {
  const first = Object.values(name).find((value) => value.trim() !== '');
  return first ? normalizePrefix(first) : null;
}

export async function listTaxonomies(
  deps: TaxonomyDeps,
  tenantId: string,
  siteId: string,
): Promise<Taxonomy[]> {
  return deps.taxonomyRepository.listTaxonomiesBySite(tenantId, siteId);
}

export async function getTaxonomy(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<Taxonomy> {
  return loadTaxonomy(deps, tenantId, id);
}

export interface UpdateTaxonomyInput {
  tenantId: string;
  id: string;
  name?: LocalizedText;
  prefix?: string | null;
  hierarchical?: boolean;
  order?: number;
}

/**
 * Changing the prefix moves every term of this dimension to a new
 * address at once — which is why the repository rewrites their address
 * rows in the same transaction, and why the availability check runs
 * before any of it.
 */
export async function updateTaxonomy(
  deps: TaxonomyDeps,
  input: UpdateTaxonomyInput,
): Promise<Taxonomy> {
  const taxonomy = await loadTaxonomy(deps, input.tenantId, input.id);
  const prefixChanges =
    input.prefix !== undefined &&
    normalizePrefix(input.prefix) !== taxonomy.prefix;
  const nextPrefix = prefixChanges
    ? normalizePrefix(input.prefix ?? null)
    : taxonomy.prefix;

  if (prefixChanges) {
    await assertTaxonomyPrefixAvailable(deps, {
      tenantId: input.tenantId,
      siteId: taxonomy.siteId,
      prefix: nextPrefix,
      taxonomyId: taxonomy.id,
      locales: await siteLocales(deps, input.tenantId, taxonomy.siteId),
    });
  }

  if (input.hierarchical === false && taxonomy.hierarchical) {
    // Refused rather than flattened: turning nesting off with terms
    // already nested would move content nobody asked to move, and the
    // only honest answer is to let the person unpick the tree first.
    const terms = await deps.taxonomyRepository.listTermsByTaxonomy(
      input.tenantId,
      taxonomy.id,
    );
    if (terms.some((term) => term.parentId !== null)) {
      throw new TaxonomyNotHierarchicalError(taxonomy.id);
    }
  }

  if (input.name) taxonomy.rename(input.name);
  if (prefixChanges) taxonomy.setPrefix(nextPrefix);
  if (input.hierarchical !== undefined) {
    taxonomy.setHierarchical(input.hierarchical);
  }
  if (input.order !== undefined) taxonomy.setOrder(input.order);

  await deps.taxonomyRepository.saveTaxonomy(taxonomy);
  if (prefixChanges) {
    await deps.taxonomyRepository.updateTermAddressPrefix(
      input.tenantId,
      taxonomy.id,
      nextPrefix,
    );
  }
  return taxonomy;
}

/**
 * Deletes the dimension, its terms and their addresses (the database
 * cascades). The pages keep existing and simply stop being classified
 * along it — a classification is a view over content, never the content
 * itself.
 */
export async function deleteTaxonomy(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<void> {
  await loadTaxonomy(deps, tenantId, id);
  await deps.taxonomyRepository.deleteTaxonomy(tenantId, id);
}
