import { SiteNotFoundError } from '@kometio/domain-core';
import {
  buildSite,
  InMemoryPageGroupRepository,
  InMemoryPageTranslationRepository,
  InMemorySiteRepository,
} from '@kometio/testing';
import { LegalDocumentsController } from './legal-documents.controller';
import type { GenerateLegalDocumentsBody } from './legal-documents.schemas';

const answers: GenerateLegalDocumentsBody['answers'] = {
  legalEntityName: 'Acme Srl',
  contactEmail: 'privacy@example.com',
  address: null,
  phone: null,
  vatId: null,
  domain: 'example.com',
  dataCollected: { contactForm: true, newsletter: false, accounts: false },
  thirdPartyServices: [],
  retentionDays: null,
  jurisdictionCountry: 'IT',
};

describe('LegalDocumentsController (unit)', () => {
  let siteRepository: InMemorySiteRepository;
  let pageGroupRepository: InMemoryPageGroupRepository;
  let pageTranslationRepository: InMemoryPageTranslationRepository;
  let controller: LegalDocumentsController;

  beforeEach(() => {
    siteRepository = new InMemorySiteRepository();
    pageTranslationRepository = new InMemoryPageTranslationRepository();
    pageGroupRepository = new InMemoryPageGroupRepository(
      undefined,
      pageTranslationRepository,
    );
    jest.spyOn(pageGroupRepository, 'addWithVersion');
    jest.spyOn(pageTranslationRepository, 'add');
    controller = new LegalDocumentsController({
      siteRepository,
      pageGroupRepository,
      pageTranslationRepository,
    });
  });

  describe('generate', () => {
    it('propagates SiteNotFoundError, unwrapped', async () => {
      await expect(
        controller.generate('tenant-1', 'user-1', 'missing-site', {
          documents: ['privacy-policy'],
          locales: ['it'],
          answers,
        }),
      ).rejects.toThrow(SiteNotFoundError);
    });

    it('creates drafts and returns one entry per document, with a translation per locale', async () => {
      await siteRepository.add(buildSite({ enabledLocales: ['it', 'en'] }));

      const result = await controller.generate('tenant-1', 'user-1', 'site-1', {
        documents: ['privacy-policy', 'cookie-policy'],
        locales: ['it', 'en'],
        answers,
      });

      expect(result.documents).toHaveLength(2);
      expect(pageGroupRepository.addWithVersion).toHaveBeenCalledTimes(2);
      for (const doc of result.documents) {
        expect(doc.translations.map((t) => t.locale).sort()).toEqual([
          'en',
          'it',
        ]);
      }
    });
  });

  describe('preview', () => {
    it('does not persist anything', async () => {
      await controller.preview({
        documents: ['terms-conditions'],
        locales: ['it', 'en'],
        answers: { ...answers, jurisdictionCountry: 'IT' },
      });

      expect(pageGroupRepository.addWithVersion).not.toHaveBeenCalled();
      expect(pageTranslationRepository.add).not.toHaveBeenCalled();
    });

    it('returns readable text per document per requested locale', async () => {
      const result = await controller.preview({
        documents: ['cookie-policy'],
        locales: ['it', 'en'],
        answers,
      });

      expect(result.documents).toHaveLength(1);
      const { locales } = result.documents[0];
      expect(locales['it'].title.length).toBeGreaterThan(0);
      expect(locales['en'].title.length).toBeGreaterThan(0);
      expect(locales['it'].sections.length).toBeGreaterThan(0);
    });
  });
});
