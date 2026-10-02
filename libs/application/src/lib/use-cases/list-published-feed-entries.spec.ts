import { describe, expect, it } from 'vitest';
import { Term } from '@kometio/domain-core';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { listPublishedFeedEntries } from './list-published-feed-entries.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  buildSite,
  InMemoryCollectionRepository,
} from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';
const domain = 'example.com';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationVersionRepository =
    new InMemoryPageTranslationVersionRepository();
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    ),
    pageGroupVersionRepository,
    pageTranslationRepository: new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    ),
    pageTranslationVersionRepository,
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    collectionRepository: new InMemoryCollectionRepository(),
    siteRepository: new InMemorySiteRepository(),
    searchPort: new InMemorySearchPort(),
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
  };
}

async function seedSite(deps: ReturnType<typeof setup>) {
  await deps.siteRepository.add(
    buildSite({
      id: siteId,
      tenantId,
      name: 'Sito di prova',
      domain,
      searchEngineIndexingEnabled: true,
      createdAt: new Date(),
    }),
  );
}

async function publishPage(
  deps: ReturnType<typeof setup>,
  slug: string,
  title: string,
  publishedAt: Date,
) {
  const group = await createPageGroup(deps, {
    tenantId,
    siteId,
    createdBy: 'user-1',
  });
  const translation = await createPageGroupTranslation(deps, {
    tenantId,
    pageGroupId: group.id,
    locale: 'it',
    slug,
    seoMeta: { title, description: `Riassunto di ${title}` },
    createdBy: 'user-1',
  });
  await publishPageTranslation(deps, {
    tenantId,
    pageTranslationId: translation.id,
    actorUserId: 'user-1',
  });
  // The in-memory publish stamps "now"; a feed is about order, so the
  // dates are set explicitly rather than left to how fast the test runs.
  const stored = await deps.pageTranslationRepository.findById(
    tenantId,
    translation.id,
  );
  if (stored) {
    Object.defineProperty(stored, 'publishedAt', {
      value: publishedAt,
      configurable: true,
    });
    await deps.pageTranslationRepository.publish(stored);
  }
  return group;
}

describe('listPublishedFeedEntries', () => {
  it('lists the site, newest first, with the address a reader can open', async () => {
    const deps = setup();
    await seedSite(deps);
    await publishPage(deps, 'vecchia', 'Vecchia', new Date('2026-01-01'));
    await publishPage(deps, 'nuova', 'Nuova', new Date('2026-03-01'));

    const listing = await listPublishedFeedEntries(deps, {
      tenantId,
      domain,
      locale: 'it',
    });

    expect(listing?.siteName).toBe('Sito di prova');
    expect(listing?.entries.map((entry) => entry.title)).toEqual([
      'Nuova',
      'Vecchia',
    ]);
    expect(listing?.entries[0].path).toBe('/it/nuova');
    expect(listing?.entries[0].description).toBe('Riassunto di Nuova');
  });

  it('answers with nothing at all for a domain this deployment does not serve', async () => {
    const deps = setup();
    await seedSite(deps);

    expect(
      await listPublishedFeedEntries(deps, {
        tenantId,
        domain: 'somebody-else.com',
        locale: 'it',
      }),
    ).toBeNull();
  });

  it('narrows to one term when asked, by the slug that term answers at', async () => {
    const deps = setup();
    await seedSite(deps);
    const dogs = await publishPage(
      deps,
      'cani',
      'Cani',
      new Date('2026-02-01'),
    );
    await publishPage(deps, 'gatti', 'Gatti', new Date('2026-02-02'));
    await deps.taxonomyRepository.addTerm(
      Term.create({
        id: 'term-1',
        tenantId,
        siteId,
        taxonomyId: 'tax-1',
        name: { it: 'Cibo per cani' },
        slugs: { it: 'cibo-per-cani' },
      }),
    );
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, dogs.id, [
      'term-1',
    ]);

    const listing = await listPublishedFeedEntries(deps, {
      tenantId,
      domain,
      locale: 'it',
      termSlug: 'cibo-per-cani',
    });

    expect(listing?.entries.map((entry) => entry.title)).toEqual(['Cani']);
  });

  it('is empty, not the whole site, for a term nobody answers to', async () => {
    const deps = setup();
    await seedSite(deps);
    await publishPage(deps, 'cani', 'Cani', new Date('2026-02-01'));

    const listing = await listPublishedFeedEntries(deps, {
      tenantId,
      domain,
      locale: 'it',
      termSlug: 'rinominato',
    });

    expect(listing?.entries).toEqual([]);
  });

  it('stops at the limit, because a feed is a way in and not an archive', async () => {
    const deps = setup();
    await seedSite(deps);
    for (let index = 0; index < 5; index += 1) {
      await publishPage(
        deps,
        `p${index}`,
        `P${index}`,
        new Date(`2026-0${index + 1}-01`),
      );
    }

    const listing = await listPublishedFeedEntries(deps, {
      tenantId,
      domain,
      locale: 'it',
      limit: 2,
    });

    expect(listing?.entries.map((entry) => entry.title)).toEqual(['P4', 'P3']);
  });
});
