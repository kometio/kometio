import { randomUUID } from 'node:crypto';
import {
  TaxonomyNotHierarchicalError,
  Term,
  TermCycleError,
  TermNotFoundError,
  TermReorderMismatchError,
} from '@kometio/domain-core';
import type { LocalizedSeoMeta, LocalizedText } from '@kometio/shared-types';
import { slugify } from '@kometio/shared-types';
import { assertTermAddressAvailable } from './term-address';
import { loadTaxonomy, loadTerm, type TaxonomyDeps } from './taxonomy-context';

export interface CreateTermInput {
  tenantId: string;
  taxonomyId: string;
  name: LocalizedText;
  /** Per locale. A locale left out means the term has no address in that language yet, which is a legitimate state. */
  slugs?: Record<string, string>;
  parentId?: string | null;
}

export async function createTerm(
  deps: TaxonomyDeps,
  input: CreateTermInput,
): Promise<Term> {
  const taxonomy = await loadTaxonomy(deps, input.tenantId, input.taxonomyId);
  if (input.parentId && !taxonomy.hierarchical) {
    throw new TaxonomyNotHierarchicalError(taxonomy.id);
  }
  if (input.parentId) {
    await loadTerm(deps, input.tenantId, input.parentId);
  }

  const slugs = normalizeSlugs(input.slugs ?? defaultSlugsFrom(input.name));
  for (const [locale, slug] of Object.entries(slugs)) {
    await assertTermAddressAvailable(deps, {
      tenantId: input.tenantId,
      siteId: taxonomy.siteId,
      locale,
      prefix: taxonomy.prefix,
      slug,
    });
  }

  const term = Term.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: taxonomy.siteId,
    taxonomyId: taxonomy.id,
    parentId: input.parentId ?? null,
    name: input.name,
    slugs,
    // After the terms it will sit beside: a new one is added at the end,
    // and stays there once a dimension has been put in an order.
    order: await nextOrderAmongSiblings(
      deps,
      input.tenantId,
      taxonomy.id,
      input.parentId ?? null,
    ),
  });
  await deps.taxonomyRepository.addTerm(term);
  return term;
}

/** The position after every term that shares `parentId` in one dimension. */
async function nextOrderAmongSiblings(
  deps: TaxonomyDeps,
  tenantId: string,
  taxonomyId: string,
  parentId: string | null,
  exceptTermId?: string,
): Promise<number> {
  const all = await deps.taxonomyRepository.listTermsByTaxonomy(
    tenantId,
    taxonomyId,
  );
  const positions = all
    .filter((term) => term.parentId === parentId && term.id !== exceptTermId)
    .map((term) => term.order);
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

/** Every language the name was written in gets an address derived from it — the same `slugify` a page's slug goes through. */
function defaultSlugsFrom(name: LocalizedText): Record<string, string> {
  return Object.fromEntries(
    Object.entries(name)
      .map(([locale, value]) => [locale, slugify(value)])
      .filter(([, slug]) => slug !== ''),
  );
}

function normalizeSlugs(slugs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(slugs)
      .map(([locale, slug]) => [locale, slugify(slug)])
      .filter(([, slug]) => slug !== ''),
  );
}

export async function listTerms(
  deps: TaxonomyDeps,
  tenantId: string,
  taxonomyId: string,
): Promise<Term[]> {
  return deps.taxonomyRepository.listTermsByTaxonomy(tenantId, taxonomyId);
}

export async function getTerm(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<Term> {
  return loadTerm(deps, tenantId, id);
}

export interface UpdateTermInput {
  tenantId: string;
  id: string;
  name?: LocalizedText;
  description?: LocalizedText;
  seoMeta?: LocalizedSeoMeta;
  /** Kept out of search engines — see Term.noindex. */
  noindex?: boolean;
  /** Replaces the addresses wholesale: a locale left out of this map loses its address, which is how a term stops being published in a language. */
  slugs?: Record<string, string>;
  landingPageGroupId?: string | null;
  order?: number;
}

export async function updateTerm(
  deps: TaxonomyDeps,
  input: UpdateTermInput,
): Promise<Term> {
  const term = await loadTerm(deps, input.tenantId, input.id);
  const taxonomy = await loadTaxonomy(deps, input.tenantId, term.taxonomyId);

  if (input.slugs) {
    const slugs = normalizeSlugs(input.slugs);
    for (const [locale, slug] of Object.entries(slugs)) {
      await assertTermAddressAvailable(deps, {
        tenantId: input.tenantId,
        siteId: term.siteId,
        locale,
        prefix: taxonomy.prefix,
        slug,
        termId: term.id,
      });
    }
    for (const locale of Object.keys(term.slugs)) {
      if (!(locale in slugs)) term.setSlug(locale, null);
    }
    for (const [locale, slug] of Object.entries(slugs)) {
      term.setSlug(locale, slug);
    }
  }

  if (input.name) term.rename(input.name);
  if (input.description) term.setDescription(input.description);
  if (input.seoMeta) term.setSeoMeta(input.seoMeta);
  if (input.noindex !== undefined) term.setNoindex(input.noindex);
  if (input.landingPageGroupId !== undefined) {
    term.setLandingPage(input.landingPageGroupId);
  }
  if (input.order !== undefined) term.setOrder(input.order);

  await deps.taxonomyRepository.saveTerm(term);
  return term;
}

export interface MoveTermInput {
  tenantId: string;
  id: string;
  parentId: string | null;
}

/**
 * Re-files a term under a different parent. The address does not change,
 * because it never contained the ancestors (docs/adr/0064) — which is
 * the whole reason reorganising a tree is safe here.
 */
export async function moveTerm(
  deps: TaxonomyDeps,
  input: MoveTermInput,
): Promise<Term> {
  const term = await loadTerm(deps, input.tenantId, input.id);
  const taxonomy = await loadTaxonomy(deps, input.tenantId, term.taxonomyId);
  if (input.parentId !== null && !taxonomy.hierarchical) {
    throw new TaxonomyNotHierarchicalError(taxonomy.id);
  }
  if (input.parentId !== null) {
    const parent = await loadTerm(deps, input.tenantId, input.parentId);
    if (parent.taxonomyId !== term.taxonomyId) {
      // Moving across dimensions is not a move, it is two edits — and
      // silently rewriting `taxonomyId` would take the term's address
      // with it, since the address carries its dimension's prefix.
      throw new TermNotFoundError(input.parentId);
    }
    await assertNoCycle(deps, input.tenantId, term.id, parent);
  }
  term.moveTo(input.parentId);
  // At the end of its new siblings, not wherever its old position happens to
  // fall among them.
  term.setOrder(
    await nextOrderAmongSiblings(
      deps,
      input.tenantId,
      term.taxonomyId,
      input.parentId,
      term.id,
    ),
  );
  await deps.taxonomyRepository.saveTerm(term);
  return term;
}

export interface ReorderSiblingTermsInput {
  tenantId: string;
  taxonomyId: string;
  /** The terms to put in order are the ones directly under this parent, or at the top of the dimension for `null`. */
  parentId: string | null;
  /** All of them, in the order wanted — what a move up or down hands back as one complete list. */
  orderedTermIds: string[];
}

/**
 * Puts the terms that share one parent in a new order.
 *
 * Only a full permutation is taken (`TermReorderMismatchError` otherwise):
 * a list missing a term, or naming one twice or one that is elsewhere in the
 * tree, is a screen that was looking at something stale, and applying it
 * would leave two terms in one position or one at a place it never asked
 * for. One statement writes every position.
 */
export async function reorderSiblingTerms(
  deps: TaxonomyDeps,
  input: ReorderSiblingTermsInput,
): Promise<void> {
  await loadTaxonomy(deps, input.tenantId, input.taxonomyId);
  const all = await deps.taxonomyRepository.listTermsByTaxonomy(
    input.tenantId,
    input.taxonomyId,
  );
  const siblingIds = new Set(
    all.filter((term) => term.parentId === input.parentId).map((t) => t.id),
  );
  const provided = new Set(input.orderedTermIds);
  const isExactPermutation =
    siblingIds.size === provided.size &&
    input.orderedTermIds.length === provided.size &&
    [...siblingIds].every((id) => provided.has(id));
  if (!isExactPermutation) {
    throw new TermReorderMismatchError();
  }
  await deps.taxonomyRepository.reorderTermSiblings({
    tenantId: input.tenantId,
    taxonomyId: input.taxonomyId,
    parentId: input.parentId,
    orderedIds: input.orderedTermIds,
    at: new Date(),
  });
}

/**
 * Walks up from the intended parent: if the term being moved is anywhere
 * on that path, the move would detach the branch from its dimension
 * entirely — a loop with no root, invisible in every listing.
 */
async function assertNoCycle(
  deps: TaxonomyDeps,
  tenantId: string,
  movingId: string,
  parent: Term,
): Promise<void> {
  let current: Term | null = parent;
  while (current) {
    if (current.id === movingId) {
      throw new TermCycleError();
    }
    current = current.parentId
      ? await deps.taxonomyRepository.findTermById(tenantId, current.parentId)
      : null;
  }
}

export async function deleteTerm(
  deps: TaxonomyDeps,
  tenantId: string,
  id: string,
): Promise<void> {
  await loadTerm(deps, tenantId, id);
  await deps.taxonomyRepository.deleteTerm(tenantId, id);
}
