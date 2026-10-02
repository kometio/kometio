import { ReusableSectionRecords } from '../reusable-sections/reusable-section-records';
import type {
  CollectionRepositoryPort,
  PageGroupRepositoryPort,
  PageGroupVersionRepositoryPort,
  PageTranslationRepositoryPort,
  PageTranslationVersionRepositoryPort,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  TaxonomyRepositoryPort,
  SearchPort,
} from '@kometio/ports';
import {
  buildSite,
  FakeContentSanitizer,
  InMemorySiteRepository,
} from '@kometio/testing';
import { PageGroupsController } from './page-groups.controller';
import { PageRecords } from './page-records';
import { PageTranslationsController } from './page-translations.controller';

/**
 * The ports the two pages controllers are built from, as mocks the specs
 * can arrange and inspect, and the controllers over them.
 */
export function setUpPages() {
  const pageGroupRepository: jest.Mocked<PageGroupRepositoryPort> = {
    addWithVersion: jest.fn(),
    addWithTranslation: jest.fn(),
    saveContent: jest.fn(),
    moveToCollection: jest.fn(),
    reorderSiblings: jest.fn(),
    findById: jest.fn(),
    countChildren: jest.fn().mockResolvedValue(0),
    listBySite: jest.fn(),
    listBySiteFiltered: jest.fn(),
    listContentBySite: jest.fn().mockResolvedValue([]),
    listSiblings: jest.fn(),
    move: jest.fn(),
    delete: jest.fn(),
  };
  const pageGroupVersionRepository: jest.Mocked<PageGroupVersionRepositoryPort> =
    {
      save: jest.fn(),
      findById: jest.fn(),
      listByGroup: jest.fn(),
    };
  const pageTranslationRepository: jest.Mocked<PageTranslationRepositoryPort> =
    {
      add: jest.fn(),
      saveContent: jest.fn(),
      publish: jest.fn(),
      saveSeoMeta: jest.fn(),
      rename: jest.fn(),
      findById: jest.fn(),
      findByGroupAndLocale: jest.fn(),
      listByGroup: jest.fn(),
      listPublishedBySite: jest.fn().mockResolvedValue([]),
      findByParentGroupAndLocaleSlug: jest.fn(),
      findByFormerSlug: jest.fn(),
      findByFormerParent: jest.fn(),
      delete: jest.fn(),
    };
  const pageTranslationVersionRepository: jest.Mocked<PageTranslationVersionRepositoryPort> =
    {
      save: jest.fn(),
      findById: jest.fn(),
      listByTranslation: jest.fn(),
    };
  const previewTokenPort: jest.Mocked<PreviewTokenPort> = {
    createToken: jest.fn(),
    validateToken: jest.fn(),
  };
  const searchPort: jest.Mocked<SearchPort> = {
    indexPage: jest.fn(),
    search: jest.fn(),
  };
  const reusableSectionRepository: jest.Mocked<ReusableSectionRepositoryPort> =
    {
      add: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
      listBySite: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };
  const taxonomyRepository: jest.Mocked<TaxonomyRepositoryPort> = {
    addTaxonomy: jest.fn(),
    addTerm: jest.fn(),
    saveTaxonomy: jest.fn(),
    findTaxonomyById: jest.fn(),
    listTaxonomiesBySite: jest.fn().mockResolvedValue([]),
    deleteTaxonomy: jest.fn(),
    saveTerm: jest.fn(),
    findTermById: jest.fn(),
    listTermsByTaxonomy: jest.fn().mockResolvedValue([]),
    listTermsBySite: jest.fn().mockResolvedValue([]),
    deleteTerm: jest.fn(),
    reorderTermSiblings: jest.fn(),
    findTermByAddress: jest.fn().mockResolvedValue(null),
    findTermByLandingPage: jest.fn().mockResolvedValue(null),
    updateTermAddressPrefix: jest.fn(),
    listTermIdsForPageGroup: jest.fn().mockResolvedValue([]),
    setTermsForPageGroup: jest.fn(),
    listPageGroupIdsForTerm: jest.fn().mockResolvedValue([]),
  };
  // The site these pages live on, in both languages the specs write.
  const siteRepository: InMemorySiteRepository = new InMemorySiteRepository(
    buildSite({ enabledLocales: ['it', 'en'] }),
  );
  const collectionRepository: jest.Mocked<CollectionRepositoryPort> = {
    add: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
    listBySite: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  };
  const reusableSectionVersionRepository: jest.Mocked<ReusableSectionVersionRepositoryPort> =
    {
      save: jest.fn(),
      findById: jest.fn(),
      listBySection: jest.fn(),
    };
  const deps = {
    pageGroupRepository,
    pageGroupVersionRepository,
    pageTranslationRepository,
    pageTranslationVersionRepository,
    previewTokenPort,
    searchPort,
    reusableSectionRepository,
    taxonomyRepository,
    siteRepository,
    contentSanitizer: new FakeContentSanitizer(),
    collectionRepository,
    reusableSectionVersionRepository,
  };
  const records = new PageRecords();
  return {
    pageGroupRepository,
    pageGroupVersionRepository,
    pageTranslationRepository,
    pageTranslationVersionRepository,
    previewTokenPort,
    searchPort,
    reusableSectionRepository,
    taxonomyRepository,
    siteRepository,
    collectionRepository,
    reusableSectionVersionRepository,
    groupsController: new PageGroupsController(
      deps,
      records,
      new ReusableSectionRecords(),
    ),
    translationsController: new PageTranslationsController(deps, records),
  };
}
