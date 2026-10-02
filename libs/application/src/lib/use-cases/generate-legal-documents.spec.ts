import { describe, expect, it } from 'vitest';
import { LocaleNotEnabledError, SiteNotFoundError } from '@kometio/domain-core';
import type { LegalDocumentAnswers } from '../legal-documents/legal-document-input';
import { generateLegalDocuments } from './generate-legal-documents.use-case';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  buildSite,
  InMemoryCollectionRepository,
} from '@kometio/testing';

describe('generateLegalDocuments', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageGroupRepository = new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    );
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    );
    const siteRepository = new InMemorySiteRepository();
    return {
      pageGroupRepository,
      pageGroupVersionRepository,
      pageTranslationRepository,
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      collectionRepository: new InMemoryCollectionRepository(),
      pageTranslationVersionRepository,
      siteRepository,
    };
  }

  async function seedSite(
    siteRepository: InMemorySiteRepository,
    overrides: { defaultLocale?: string; enabledLocales?: string[] } = {},
  ) {
    const site = buildSite({
      id: siteId,
      tenantId,
      name: 'Il mio sito',
      defaultLocale: overrides.defaultLocale ?? 'it',
      enabledLocales: overrides.enabledLocales ?? ['it', 'en'],
      formSubmissionRetentionDays: 30,
      createdAt: new Date(),
    });
    await siteRepository.add(site);
    return site;
  }

  const answers: LegalDocumentAnswers = {
    legalEntityName: 'Acme Srl',
    contactEmail: 'privacy@example.com',
    address: 'Via Roma 1, Milano',
    phone: '+39 02 1234567',
    vatId: 'IT12345678901',
    domain: 'example.com',
    dataCollected: { contactForm: true, newsletter: false, accounts: false },
    thirdPartyServices: ['Google Analytics'],
    retentionDays: 30,
    jurisdictionCountry: 'IT',
  };

  it('throws SiteNotFoundError for a nonexistent site', async () => {
    const deps = setup();

    await expect(
      generateLegalDocuments(deps, {
        tenantId,
        siteId: 'does-not-exist',
        documents: ['privacy-policy'],
        locales: ['it'],
        answers,
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('refuses a language the site does not offer before writing any page', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { enabledLocales: ['it'] });

    await expect(
      generateLegalDocuments(deps, {
        tenantId,
        siteId,
        documents: ['privacy-policy', 'cookie-policy'],
        locales: ['it', 'de'],
        answers,
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(LocaleNotEnabledError);
    expect(
      await deps.pageGroupRepository.listSiblings(tenantId, siteId, null),
    ).toEqual([]);
  });

  it('creates one page group per requested document, each as a draft translation per requested locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['privacy-policy', 'cookie-policy'],
      locales: ['it', 'en'],
      answers,
      createdBy: 'user-1',
    });

    expect(result.documents).toHaveLength(2);
    for (const doc of result.documents) {
      expect(doc.translations).toHaveLength(2);
      expect(doc.translations.map((t) => t.locale).sort()).toEqual([
        'en',
        'it',
      ]);
      for (const t of doc.translations) {
        const translation = await deps.pageTranslationRepository.findById(
          tenantId,
          t.translationId,
        );
        expect(translation?.status).toBe('draft');
      }
    }
  });

  it('uses distinct default slugs per document and locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['privacy-policy', 'cookie-policy', 'terms-conditions'],
      locales: ['it', 'en'],
      answers,
      createdBy: 'user-1',
    });

    const slugsByKind = Object.fromEntries(
      result.documents.map((doc) => [
        doc.kind,
        Object.fromEntries(doc.translations.map((t) => [t.locale, t.slug])),
      ]),
    );

    expect(slugsByKind['privacy-policy'].it).toBe('privacy-policy');
    expect(slugsByKind['cookie-policy'].it).toBe('cookie-policy');
    expect(slugsByKind['terms-conditions'].it).toBe('termini-e-condizioni');
    expect(slugsByKind['terms-conditions'].en).toBe('terms-and-conditions');
  });

  it('resolves a slug conflict with a site the same way page creation already does', async () => {
    const deps = setup();
    const site = await seedSite(deps.siteRepository);
    // Pre-occupy the default slug at the root, same (locale, parentId).
    const { createPageGroup } = await import('./create-page-group.use-case');
    const { createPageGroupTranslation } =
      await import('./create-page-group-translation.use-case');
    const existingGroup = await createPageGroup(deps, {
      tenantId,
      siteId: site.id,
      parentId: null,
      createdBy: 'user-1',
    });
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: existingGroup.id,
      locale: 'it',
      slug: 'privacy-policy',
      seoMeta: { title: 'Existing', description: '' },
      createdBy: 'user-1',
    });

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['privacy-policy'],
      locales: ['it'],
      answers,
      createdBy: 'user-1',
    });

    const translation = result.documents[0].translations[0];
    expect(translation.slug).toBe('privacy-policy-2');
  });

  it('does not set a fieldValues overlay for the site default locale (its text already IS the group content)', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { defaultLocale: 'it' });

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['privacy-policy'],
      locales: ['it', 'en'],
      answers,
      createdBy: 'user-1',
    });

    const doc = result.documents[0];
    const itTranslationId = doc.translations.find((t) => t.locale === 'it')
      ?.translationId as string;
    const enTranslationId = doc.translations.find((t) => t.locale === 'en')
      ?.translationId as string;

    const itTranslation = await deps.pageTranslationRepository.findById(
      tenantId,
      itTranslationId,
    );
    const enTranslation = await deps.pageTranslationRepository.findById(
      tenantId,
      enTranslationId,
    );

    expect(itTranslation?.fieldValues).toEqual({});
    expect(
      Object.keys(enTranslation?.fieldValues ?? {}).length,
    ).toBeGreaterThan(0);
  });

  it('builds a real block tree: a warning Callout followed by Heading/Text pairs per section', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository, { defaultLocale: 'it' });

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['privacy-policy'],
      locales: ['it'],
      answers,
      createdBy: 'user-1',
    });

    const group = await deps.pageGroupRepository.findById(
      tenantId,
      result.documents[0].pageGroupId,
    );

    expect(group?.content[0]).toMatchObject({ type: 'Callout' });
    expect((group?.content[0].props as { tone: string }).tone).toBe('warning');
    const remainingTypes = group?.content.slice(1).map((b) => b.type) ?? [];
    // Every section is one Heading followed by at least one Text.
    expect(remainingTypes[0]).toBe('Heading');
    expect(remainingTypes).toContain('Text');
  });

  it('never publishes a generated translation', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const result = await generateLegalDocuments(deps, {
      tenantId,
      siteId,
      documents: ['terms-conditions'],
      locales: ['it'],
      answers,
      createdBy: 'user-1',
    });

    const translation = await deps.pageTranslationRepository.findById(
      tenantId,
      result.documents[0].translations[0].translationId,
    );
    expect(translation?.status).toBe('draft');
  });
});
