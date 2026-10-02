import { describe, expect, it } from 'vitest';
import type { PageContent } from '@kometio/shared-types';
import { Taxonomy, Term } from '@kometio/domain-core';
import { resolveTermLists } from './resolve-term-lists';
import { InMemoryTaxonomyRepository } from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';
const locale = 'it';

function setup() {
  return { taxonomyRepository: new InMemoryTaxonomyRepository() };
}

async function seedDimension(
  deps: ReturnType<typeof setup>,
  input: {
    prefix: string | null;
    terms: { id: string; name: string; slug: string | null }[];
  },
) {
  const taxonomy = Taxonomy.create({
    id: 'tax-1',
    tenantId,
    siteId,
    prefix: input.prefix,
    name: { [locale]: 'Categoria' },
    hierarchical: false,
  });
  await deps.taxonomyRepository.addTaxonomy(taxonomy);
  for (const term of input.terms) {
    await deps.taxonomyRepository.addTerm(
      Term.create({
        id: term.id,
        tenantId,
        siteId,
        taxonomyId: taxonomy.id,
        name: { [locale]: term.name },
        slugs: term.slug ? { [locale]: term.slug } : {},
      }),
    );
  }
  return taxonomy;
}

function pageWithFilter(): PageContent {
  return [
    {
      id: 'block-1',
      type: 'TermList',
      props: {
        taxonomyId: 'tax-1',
        behaviour: 'filter',
        style: 'chips',
        showAll: true,
        choices: [],
      },
    },
  ];
}

describe('resolveTermLists', () => {
  it('offers every term of the dimension, with the address its own page answers at', async () => {
    const deps = setup();
    await seedDimension(deps, {
      prefix: 'categoria',
      terms: [
        { id: 'term-1', name: 'Cibo per cani', slug: 'cibo-per-cani' },
        { id: 'term-2', name: 'Cibo per gatti', slug: 'cibo-per-gatti' },
      ],
    });

    const { contents } = await resolveTermLists(deps, tenantId, locale, [
      pageWithFilter(),
    ]);

    expect(contents[0][0].props['choices']).toEqual([
      {
        id: 'term-1',
        label: 'Cibo per cani',
        slug: 'cibo-per-cani',
        path: '/it/categoria/cibo-per-cani',
      },
      {
        id: 'term-2',
        label: 'Cibo per gatti',
        slug: 'cibo-per-gatti',
        path: '/it/categoria/cibo-per-gatti',
      },
    ]);
  });

  it('leaves out a term that has no address in the language being read', async () => {
    const deps = setup();
    await seedDimension(deps, {
      prefix: null,
      terms: [
        { id: 'term-1', name: 'Solo in inglese', slug: null },
        { id: 'term-2', name: 'Cibo per gatti', slug: 'cibo-per-gatti' },
      ],
    });

    const { contents } = await resolveTermLists(deps, tenantId, locale, [
      pageWithFilter(),
    ]);

    const choices = contents[0][0].props['choices'] as { id: string }[];
    expect(choices.map((choice) => choice.id)).toEqual(['term-2']);
  });

  it('says which offered terms each page carries, which is what narrows a grid', async () => {
    const deps = setup();
    await seedDimension(deps, {
      prefix: 'categoria',
      terms: [
        { id: 'term-1', name: 'Cibo per cani', slug: 'cibo-per-cani' },
        { id: 'term-2', name: 'Cibo per gatti', slug: 'cibo-per-gatti' },
      ],
    });
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, 'page-1', [
      'term-1',
      'term-2',
    ]);
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, 'page-2', [
      'term-2',
    ]);

    const { slugsByGroup } = await resolveTermLists(deps, tenantId, locale, [
      pageWithFilter(),
    ]);

    expect(slugsByGroup.get('page-1')?.sort()).toEqual([
      'cibo-per-cani',
      'cibo-per-gatti',
    ]);
    expect(slugsByGroup.get('page-2')).toEqual(['cibo-per-gatti']);
  });

  it('draws nothing for a dimension that was deleted, rather than taking the page down', async () => {
    const deps = setup();

    const { contents, slugsByGroup } = await resolveTermLists(
      deps,
      tenantId,
      locale,
      [pageWithFilter()],
    );

    expect(contents[0][0].props['choices']).toEqual([]);
    expect(slugsByGroup.size).toBe(0);
  });

  it('does not ask the repository anything when no filter is on the page', async () => {
    const deps = setup();
    const plain: PageContent = [
      { id: 'block-1', type: 'Text', props: { body: '<p>ciao</p>' } },
    ];

    const { contents, slugsByGroup } = await resolveTermLists(
      deps,
      tenantId,
      locale,
      [plain],
    );

    expect(contents[0]).toBe(plain);
    expect(slugsByGroup.size).toBe(0);
  });
});
