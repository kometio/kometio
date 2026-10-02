import { beforeEach, describe, expect, it } from 'vitest';
import {
  PageGroup,
  PageTranslation,
  Taxonomy,
  Term,
} from '@kometio/domain-core';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
  InMemoryTaxonomyRepository,
  buildSite,
} from '@kometio/testing';
import { getPublishedTermByPath } from './get-published-term-by-path.use-case';

const tenantId = 'tenant-1';
const domain = 'example.com';

describe('getPublishedTermByPath', () => {
  let deps: ReturnType<typeof setup>;
  let siteId: string;

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    return {
      siteRepository: new InMemorySiteRepository(),
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      pageGroupRepository: new InMemoryPageGroupRepository(
        pageGroupVersionRepository,
      ),
      pageTranslationRepository: new InMemoryPageTranslationRepository(
        pageTranslationVersionRepository,
      ),
      siteLayoutSectionRepository: new InMemorySiteLayoutSectionRepository(),
      siteThemeBlockStylesRepository:
        new InMemorySiteThemeBlockStylesRepository(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
    };
  }

  beforeEach(async () => {
    deps = setup();
    const site = buildSite({
      tenantId,
      name: 'Sito',
      domain,
      enabledLocales: ['it', 'en'],
      searchEngineIndexingEnabled: true,
      createdAt: new Date(),
    });
    await deps.siteRepository.add(site);
    siteId = site.id;
  });

  async function seedTerm(options: {
    prefix: string | null;
    slugs?: Record<string, string>;
    name?: Record<string, string>;
    description?: Record<string, string>;
  }) {
    const taxonomy = Taxonomy.create({
      id: `taxonomy-${options.prefix ?? 'root'}`,
      tenantId,
      siteId,
      prefix: options.prefix,
      name: { it: 'Categoria' },
    });
    await deps.taxonomyRepository.addTaxonomy(taxonomy);
    const term = Term.create({
      id: 'term-1',
      tenantId,
      siteId,
      taxonomyId: taxonomy.id,
      name: options.name ?? { it: 'Espresso', en: 'Espresso machines' },
      slugs: options.slugs ?? { it: 'espresso', en: 'espresso-machines' },
    });
    if (options.description) {
      term.setDescription(options.description);
    }
    await deps.taxonomyRepository.addTerm(term);
    return term;
  }

  async function seedPublishedPage(
    id: string,
    slug: string,
    title: string,
    locale = 'it',
  ) {
    const group = PageGroup.create({
      id,
      tenantId,
      siteId,
      createdBy: null,
    });
    await deps.pageGroupRepository.add(group);
    const translation = PageTranslation.create({
      id: `${id}-${locale}`,
      tenantId,
      siteId,
      pageGroupId: group.id,
      locale,
      slug,
      seoMeta: { title, description: '' },
      createdBy: null,
    });
    translation.publish([{ id: 'b', type: 'Text', props: { body: title } }], {
      by: null,
    });
    await deps.pageTranslationRepository.add(translation, null);
    return group;
  }

  function ask(segments: string[], locale = 'it') {
    return getPublishedTermByPath(deps, {
      tenantId,
      domain,
      locale,
      segments,
    });
  }

  it('answers at the dimension prefix plus the term slug', async () => {
    await seedTerm({ prefix: 'categoria' });

    const result = await ask(['categoria', 'espresso']);

    expect(result?.term.name).toBe('Espresso');
    expect(result?.seoMeta.title).toBe('Espresso');
  });

  it('answers at the bare slug for a dimension mounted at the root', async () => {
    await seedTerm({ prefix: null });

    expect(await ask(['espresso'])).toBeTruthy();
    // ...and not under a prefix it does not have.
    expect(await ask(['categoria', 'espresso'])).toBeNull();
  });

  /*
   * A term's address is one or two segments, flat by design — the
   * ancestors are not in the path (ADR-0064). Anything deeper is a page
   * path that failed, not a term.
   */
  it('does not answer a path deeper than two segments', async () => {
    await seedTerm({ prefix: 'categoria' });

    expect(await ask(['categoria', 'espresso', 'altro'])).toBeNull();
  });

  it('lists the pages filed under the term, by title', async () => {
    const term = await seedTerm({ prefix: 'categoria' });
    const first = await seedPublishedPage('g1', 'zeta', 'Zeta');
    const second = await seedPublishedPage('g2', 'alfa', 'Alfa');
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, first.id, [
      term.id,
    ]);
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, second.id, [
      term.id,
    ]);

    const result = await ask(['categoria', 'espresso']);

    const grid = result?.content.find((block) => block.type === 'PageGrid');
    expect(grid?.props['items']).toEqual([
      expect.objectContaining({
        pageGroupId: 'g2',
        title: 'Alfa',
        path: '/it/alfa',
      }),
      expect.objectContaining({
        pageGroupId: 'g1',
        title: 'Zeta',
        path: '/it/zeta',
      }),
    ]);
  });

  /*
   * A page with no published translation in this language has no address
   * here, so listing it would be listing a dead link.
   */
  it('leaves out a page that is not published in this language', async () => {
    const term = await seedTerm({ prefix: 'categoria' });
    const group = await seedPublishedPage('g1', 'solo-it', 'Solo IT', 'it');
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, group.id, [
      term.id,
    ]);

    const result = await ask(['categoria', 'espresso-machines'], 'en');

    const grid = result?.content.find((block) => block.type === 'PageGrid');
    expect(grid?.props['items']).toEqual([]);
  });

  it('opens with an h1-capable Hero carrying the name and the introduction', async () => {
    await seedTerm({
      prefix: 'categoria',
      description: { it: 'Le macchine da caffè' },
    });

    const result = await ask(['categoria', 'espresso']);

    expect(result?.content[0]).toMatchObject({
      type: 'Hero',
      props: { title: 'Espresso', subtitle: 'Le macchine da caffè' },
    });
  });

  /*
   * Rendered in place, never redirected (ADR-0064): the address is the
   * term's, and what is drawn is the page somebody built.
   */
  it('renders the hand-built landing page on the term own address', async () => {
    const term = await seedTerm({ prefix: 'categoria' });
    const group = await seedPublishedPage('g1', 'pagina', 'Pagina');
    term.setLandingPage(group.id);
    await deps.taxonomyRepository.saveTerm(term);

    const result = await ask(['categoria', 'espresso']);

    expect(result?.term.hasLandingPage).toBe(true);
    expect(result?.content).toEqual([
      { id: 'b', type: 'Text', props: { body: 'Pagina' } },
    ]);
  });

  /*
   * And the promise that makes rendering in place worth it: the landing
   * page can go away without the address going with it.
   */
  it('falls back to the default layout when the landing page is not published here', async () => {
    const term = await seedTerm({ prefix: 'categoria' });
    const group = await seedPublishedPage('g1', 'pagina', 'Pagina', 'en');
    term.setLandingPage(group.id);
    await deps.taxonomyRepository.saveTerm(term);

    const result = await ask(['categoria', 'espresso']);

    expect(result?.term.hasLandingPage).toBe(false);
    expect(result?.content[0]?.type).toBe('Hero');
  });

  it('offers the term other languages, prefix included', async () => {
    await seedTerm({ prefix: 'categoria' });

    const result = await ask(['categoria', 'espresso']);

    expect(result?.translations).toEqual([
      { locale: 'it', slug: 'espresso', ancestorSlugs: ['categoria'] },
      {
        locale: 'en',
        slug: 'espresso-machines',
        ancestorSlugs: ['categoria'],
      },
    ]);
  });

  it('is nothing at all on an unknown domain', async () => {
    await seedTerm({ prefix: 'categoria' });

    const result = await getPublishedTermByPath(deps, {
      tenantId,
      domain: 'somewhere-else.example',
      locale: 'it',
      segments: ['categoria', 'espresso'],
    });

    expect(result).toBeNull();
  });
});
