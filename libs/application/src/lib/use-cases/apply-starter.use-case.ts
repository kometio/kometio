import { randomUUID } from 'node:crypto';
import {
  SiteIsNotBlankError,
  StarterThemeUnavailableError,
  type PageGroup,
  type PageTranslation,
  type Site,
} from '@kometio/domain-core';
import type {
  CollectionRepositoryPort,
  FormRepositoryPort,
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  ReusableSectionRepositoryPort,
  SearchPort,
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
  ThemeCatalogPort,
} from '@kometio/ports';
import type {
  PageContent,
  StarterId,
  StarterLanguage,
} from '@kometio/shared-types';
import {
  emptyStarterIds,
  resolveStarterContent,
  type StarterIds,
} from '../starters/resolve-starter-content';
import type { StarterContent } from '../starters/starter';
import {
  findStarter,
  STARTERS,
  starterLanguageFor,
} from '../starters/starters';
import { createCollection, deleteCollection } from './collection.use-cases';
import { createForm } from './create-form.use-case';
import { createPage } from './create-page.use-case';
import { getOrCreateSiteLayoutSection } from './get-or-create-site-layout-section.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { publishSiteLayoutSection } from './publish-site-layout-section.use-case';
import { requireSite } from './require-site';
import { savePageGroupContent } from './save-page-group-content.use-case';
import { saveSiteLayoutSectionDraft } from './save-site-layout-section-draft.use-case';
import { setPageGroupTerms } from './page-group-terms.use-cases';
import { createTaxonomy, deleteTaxonomy } from './taxonomy.use-cases';
import { createTerm } from './term.use-cases';
import { updateForm } from './update-form.use-case';
import { updatePageTranslationSeoMeta } from './update-page-translation-seo-meta.use-case';
import { updateSiteThemePackage } from './update-site-theme-package.use-case';
import { deleteForm } from './delete-form.use-case';

export interface StarterOfferDeps {
  siteRepository: SiteRepositoryPort;
  themeCatalog: ThemeCatalogPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  collectionRepository: CollectionRepositoryPort;
  formRepository: FormRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
}

export interface ApplyStarterDeps extends StarterOfferDeps {
  siteLayoutSectionVersionRepository: SiteLayoutSectionVersionRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  searchPort: SearchPort;
}

/** The home page a new site has, as the wizard made it. */
interface WizardHome {
  group: PageGroup;
  translation: PageTranslation;
}

/**
 * The site's home page when the site is still the one the wizard made: that
 * page as it left it, and nothing beside it — no other page, form, section or
 * category, and a header and footer that are empty if they are there at all.
 * `null` when it is anything else.
 *
 * It answers rather than throws so that "is it offered?" and "may it be
 * applied?" are one question asked in one place.
 */
async function findWizardHome(
  deps: StarterOfferDeps,
  site: Site,
): Promise<WizardHome | null> {
  const tenantId = site.tenantId;
  const siteId = site.id;
  const groups = await deps.pageGroupRepository.listBySite(tenantId, siteId, {
    page: 1,
    pageSize: 2,
  });
  const [summary] = groups.items;
  if (groups.total !== 1 || !summary) return null;

  const group = await deps.pageGroupRepository.findById(tenantId, summary.id);
  if (!group || group.collectionId !== null) return null;
  const translations = await deps.pageTranslationRepository.listByGroup(
    tenantId,
    group.id,
  );
  const [translation] = translations;
  if (translations.length !== 1 || !translation) return null;
  if (translation.locale !== site.defaultLocale) return null;

  if (!isWizardHome(group.content, site.name)) return null;

  const [forms, collections, taxonomies] = await Promise.all([
    deps.formRepository.listBySite(tenantId, siteId, { page: 1, pageSize: 1 }),
    deps.collectionRepository.listBySite(tenantId, siteId),
    deps.taxonomyRepository.listTaxonomiesBySite(tenantId, siteId),
  ]);
  if (forms.total > 0 || collections.length > 0 || taxonomies.length > 0) {
    return null;
  }

  for (const kind of ['header', 'footer'] as const) {
    const section = await deps.siteLayoutSectionRepository.findBySiteLocaleKind(
      tenantId,
      siteId,
      site.defaultLocale,
      kind,
    );
    if (
      section &&
      (section.content.length > 0 || section.publishedContent?.length)
    ) {
      return null;
    }
  }

  return { group, translation };
}

/** The one Hero the wizard writes: the site's name and nothing under it. */
function isWizardHome(content: PageContent, siteName: string): boolean {
  const [only] = content;
  if (content.length !== 1 || !only || only.type !== 'Hero') return false;
  if (only.children && only.children.length > 0) return false;
  const { title, subtitle, eyebrow } = only.props;
  return (
    title === siteName &&
    (subtitle === undefined || subtitle === '') &&
    (eyebrow === undefined || eyebrow === '')
  );
}

/** One starting point, and whether this deployment can make it. */
export interface StarterOfferEntry {
  id: StarterId;
  /** The theme it is drawn for. */
  themeName: string;
  /**
   * False when the deployment does not have that theme (`KOMETIO_THEME` names
   * others, or the build left it out): the starter is shown as unavailable and
   * refused, with the theme's name.
   */
  themeAvailable: boolean;
}

export interface StarterOffer {
  /** Whether the site is still new enough to be given one. */
  available: boolean;
  /** The language the starting points would be written in for this site. */
  language: StarterLanguage;
  /** True where the site's language is not one a starter is written in: the English text is offered. */
  fallback: boolean;
  starters: StarterOfferEntry[];
}

/**
 * Whether a starter's theme can be put on this site: the site is on it
 * already, or the deployment carries it. One question, asked by the offer to
 * draw the choice and by the application to refuse it.
 */
async function starterThemeAvailable(
  deps: StarterOfferDeps,
  site: Site,
  themeName: string,
): Promise<boolean> {
  if (site.themeName === themeName) return true;
  const offered = await deps.themeCatalog.listAvailableThemes();
  return offered.some((theme) => theme.name === themeName);
}

export async function getStarterOffer(
  deps: StarterOfferDeps,
  input: { tenantId: string; siteId: string },
): Promise<StarterOffer> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  const home = await findWizardHome(deps, site);
  const { language, fallback } = starterLanguageFor(site.defaultLocale);
  const starters: StarterOfferEntry[] = [];
  for (const starter of STARTERS) {
    starters.push({
      id: starter.id,
      themeName: starter.themeName,
      themeAvailable: await starterThemeAvailable(
        deps,
        site,
        starter.themeName,
      ),
    });
  }
  return {
    available: home !== null,
    language,
    fallback,
    starters,
  };
}

export interface ApplyStarterInput {
  tenantId: string;
  siteId: string;
  starterId: StarterId;
  actorUserId: string;
}

export interface ApplyStarterResult {
  starterId: StarterId;
  language: StarterLanguage;
  fallback: boolean;
  /** How many pages the site has now, the home page included. */
  pages: number;
}

/**
 * Gives a new site a starting point (docs/adr/0136): its pages, header and
 * footer, and whatever they refer to — a contact form, a section of the
 * editor, a category — written in the language the site was made in.
 *
 * It is made of the use cases a person's own clicks go through, so a page is
 * held to every rule a page is (an address that is free, a language that is
 * enabled) and the content is the content the editor would have saved. What
 * it cannot be is one transaction: there is no unit of work to wrap that many
 * writes in. So it keeps what it made, in order, and if anything fails it
 * undoes it in reverse and puts the home page back — the site is as new as it
 * was, and the person can try again, instead of being left with half of one.
 */
export async function applyStarter(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
): Promise<ApplyStarterResult> {
  const { tenantId, siteId, actorUserId } = input;
  const site = await requireSite(deps.siteRepository, tenantId, siteId);
  const home = await findWizardHome(deps, site);
  if (!home) {
    throw new SiteIsNotBlankError(siteId);
  }
  const starter = findStarter(input.starterId);
  if (!(await starterThemeAvailable(deps, site, starter.themeName))) {
    throw new StarterThemeUnavailableError(starter.id, starter.themeName);
  }
  const { language, fallback } = starterLanguageFor(site.defaultLocale);
  const content = starter.content[language]({ siteName: site.name });
  const locale = site.defaultLocale;

  const undo: (() => Promise<void>)[] = [];
  try {
    await applyTheme(deps, site, starter.themeName, undo);
    const ids = emptyStarterIds();
    const collectionIds = new Map<string, string>();

    await makeForms(deps, input, content, ids, undo);
    await makeCollections(deps, input, content, collectionIds, undo);
    const termIds = await makeTaxonomies(
      deps,
      input,
      locale,
      content,
      ids,
      undo,
    );

    // Every page has the id it will have before any is written, so a block
    // that points at a page already holds the real one.
    for (const page of content.pages) {
      ids.page.set(
        page.key,
        page.key === 'home' ? home.group.id : randomUUID(),
      );
    }

    for (const page of content.pages) {
      if (page.key === 'home') continue;
      const groupId = pageId(ids, page.key);
      const { translation } = await createPage(deps, {
        id: groupId,
        tenantId,
        siteId,
        parentId: page.parent ? pageId(ids, page.parent) : null,
        collectionId: page.collection
          ? requireKey(collectionIds, page.collection)
          : null,
        content: resolveStarterContent(page.content, ids),
        locale,
        slug: page.slug,
        seoMeta: { title: page.title, description: page.description },
        createdBy: actorUserId,
      });
      undo.push(() => deps.pageGroupRepository.delete(tenantId, groupId));
      if (page.terms && page.terms.length > 0) {
        await setPageGroupTerms(deps, {
          tenantId,
          pageGroupId: groupId,
          termIds: page.terms.map((key) => requireKey(termIds, key)),
        });
      }
      await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId,
      });
    }

    await makeHome(deps, input, content, ids, home, undo);
    await makeLayout(deps, input, locale, content, ids, undo);
  } catch (error) {
    for (const step of undo.reverse()) {
      try {
        await step();
      } catch {
        // Best effort, and the person is told about the failure that
        // started it, not about this one.
      }
    }
    throw error;
  }

  return {
    starterId: starter.id,
    language,
    fallback,
    pages: content.pages.length,
  };
}

function requireKey(map: Map<string, string>, key: string): string {
  const id = map.get(key);
  if (id === undefined) {
    throw new Error(`A starter refers to "${key}", which it does not have`);
  }
  return id;
}

function pageId(ids: StarterIds, key: string): string {
  return requireKey(ids.page, key);
}

/** The theme the starter was designed for, when the site is not on it. */
async function applyTheme(
  deps: ApplyStarterDeps,
  site: Site,
  themeName: string,
  undo: (() => Promise<void>)[],
): Promise<void> {
  if (site.themeName === themeName) return;
  const previous = site.themeName;
  await updateSiteThemePackage(deps, {
    tenantId: site.tenantId,
    siteId: site.id,
    themeName,
  });
  undo.push(async () => {
    await updateSiteThemePackage(deps, {
      tenantId: site.tenantId,
      siteId: site.id,
      themeName: previous,
    });
  });
}

async function makeForms(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
  content: StarterContent,
  ids: StarterIds,
  undo: (() => Promise<void>)[],
): Promise<void> {
  for (const wanted of content.forms) {
    const form = await createForm(deps, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: wanted.name,
    });
    undo.push(() =>
      deleteForm(deps, { tenantId: input.tenantId, formId: form.id }),
    );
    await updateForm(deps, {
      tenantId: input.tenantId,
      formId: form.id,
      name: wanted.name,
      fields: wanted.fields,
      steps: [],
      notificationEmails: [],
      // A starter's form asks, as every new form does (docs/adr/0145).
      captchaEnabled: true,
    });
    ids.form.set(wanted.key, form.id);
  }
}

async function makeCollections(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
  content: StarterContent,
  collectionIds: Map<string, string>,
  undo: (() => Promise<void>)[],
): Promise<void> {
  for (const wanted of content.collections) {
    const collection = await createCollection(deps, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: wanted.name,
      icon: wanted.icon,
    });
    undo.push(() => deleteCollection(deps, input.tenantId, collection.id));
    collectionIds.set(wanted.key, collection.id);
  }
}

async function makeTaxonomies(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
  locale: string,
  content: StarterContent,
  ids: StarterIds,
  undo: (() => Promise<void>)[],
): Promise<Map<string, string>> {
  const termIds = new Map<string, string>();
  for (const wanted of content.taxonomies) {
    const taxonomy = await createTaxonomy(deps, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: { [locale]: wanted.name },
    });
    // Its terms go with it.
    undo.push(() => deleteTaxonomy(deps, input.tenantId, taxonomy.id));
    ids.taxonomy.set(wanted.key, taxonomy.id);
    for (const term of wanted.terms) {
      const made = await createTerm(deps, {
        tenantId: input.tenantId,
        taxonomyId: taxonomy.id,
        name: { [locale]: term.name },
      });
      ids.term.set(term.key, made.id);
      termIds.set(term.key, made.id);
    }
  }
  return termIds;
}

/**
 * The wizard's home page takes the starter's: the same page, so the address
 * the site is opened at never changes and nothing is left to redirect.
 */
async function makeHome(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
  content: StarterContent,
  ids: StarterIds,
  home: WizardHome,
  undo: (() => Promise<void>)[],
): Promise<void> {
  const page = content.pages.find((candidate) => candidate.key === 'home');
  if (!page) throw new Error('A starter has no home page');
  const { tenantId, actorUserId } = input;
  const before = {
    content: home.group.content,
    seoMeta: home.translation.seoMeta,
  };

  await savePageGroupContent(deps, {
    tenantId,
    pageGroupId: home.group.id,
    content: resolveStarterContent(page.content, ids),
    actorUserId,
  });
  undo.push(async () => {
    await savePageGroupContent(deps, {
      tenantId,
      pageGroupId: home.group.id,
      content: before.content,
      actorUserId,
    });
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: home.translation.id,
      actorUserId,
    });
  });
  await updatePageTranslationSeoMeta(deps, {
    tenantId,
    pageTranslationId: home.translation.id,
    seoMeta: { ...before.seoMeta, description: page.description },
    actorUserId,
  });
  undo.push(async () => {
    await updatePageTranslationSeoMeta(deps, {
      tenantId,
      pageTranslationId: home.translation.id,
      seoMeta: before.seoMeta,
      actorUserId,
    });
  });
  await publishPageTranslation(deps, {
    tenantId,
    pageTranslationId: home.translation.id,
    actorUserId,
  });
}

async function makeLayout(
  deps: ApplyStarterDeps,
  input: ApplyStarterInput,
  locale: string,
  content: StarterContent,
  ids: StarterIds,
  undo: (() => Promise<void>)[],
): Promise<void> {
  for (const [kind, blocks] of [
    ['header', content.header],
    ['footer', content.footer],
  ] as const) {
    const section = await getOrCreateSiteLayoutSection(deps, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      locale,
      kind,
    });
    undo.push(async () => {
      await saveSiteLayoutSectionDraft(deps, {
        tenantId: input.tenantId,
        id: section.id,
        content: [],
        actorUserId: input.actorUserId,
      });
      await publishSiteLayoutSection(deps, {
        tenantId: input.tenantId,
        id: section.id,
      });
    });
    await saveSiteLayoutSectionDraft(deps, {
      tenantId: input.tenantId,
      id: section.id,
      content: resolveStarterContent(blocks, ids),
      actorUserId: input.actorUserId,
    });
    await publishSiteLayoutSection(deps, {
      tenantId: input.tenantId,
      id: section.id,
    });
  }
}
