import { describe, expect, it } from 'vitest';
import {
  NotAPageTemplateError,
  PageGroupNotFoundError,
  ReusableSection,
  ReusableSectionNameAlreadyExistsError,
  ReusableSectionNotFoundError,
} from '@kometio/domain-core';
import {
  sectionOverrideKey,
  type Block,
  type PageContent,
  type ReusableSectionKind,
} from '@kometio/shared-types';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { divergePageTranslation } from './diverge-page-translation.use-case';
import { saveDivergedPageTranslationContent } from './save-diverged-page-translation-content.use-case';
import { createPage } from './create-page.use-case';
import { savePageGroupAsTemplate } from './page-template.use-cases';
import { savePageTranslationFieldValues } from './save-page-translation-field-values.use-case';
import {
  FakeContentSanitizer,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemoryReusableSectionVersionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  InMemoryCollectionRepository,
  buildCollection,
} from '@kometio/testing';
import { buildSite } from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationVersionRepository =
    new InMemoryPageTranslationVersionRepository();
  const pageTranslationRepository = new InMemoryPageTranslationRepository(
    pageTranslationVersionRepository,
  );
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
      pageTranslationRepository,
    ),
    pageGroupVersionRepository,
    pageTranslationRepository,
    pageTranslationVersionRepository,
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
    reusableSectionVersionRepository:
      new InMemoryReusableSectionVersionRepository(),
    // An Italian-default site that also offers English.
    siteRepository: new InMemorySiteRepository(
      buildSite({ defaultLocale: 'it', enabledLocales: ['it', 'en'] }),
    ),
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    collectionRepository: new InMemoryCollectionRepository(
      buildCollection({ id: 'collection-news' }),
    ),
    searchPort: new InMemorySearchPort(),
    contentSanitizer: new FakeContentSanitizer(),
  };
}

type Deps = ReturnType<typeof setup>;

async function seedSection(
  deps: Deps,
  options: {
    id?: string;
    kind?: ReusableSectionKind;
    published?: PageContent | null;
    draft?: PageContent;
    siteId?: string;
    tenantId?: string;
  },
): Promise<ReusableSection> {
  const section = ReusableSection.create({
    id: options.id ?? 'template-1',
    tenantId: options.tenantId ?? tenantId,
    siteId: options.siteId ?? siteId,
    name: `Section ${options.id ?? 'template-1'}`,
    kind: options.kind ?? 'template',
    content: options.published ?? [],
  });
  if (options.published !== null) {
    section.publish();
  }
  if (options.draft) {
    section.saveDraft(options.draft);
  }
  await deps.reusableSectionRepository.add(section);
  return section;
}

let nextSlug = 0;

/** A page started from a template, at an address of its own each time. */
async function fromTemplate(
  deps: Deps,
  input: { templateId: string; collectionId?: string },
) {
  const { group } = await createPage(deps, {
    tenantId,
    siteId,
    templateId: input.templateId,
    collectionId: input.collectionId,
    locale: 'it',
    slug: `pagina-${++nextSlug}`,
    seoMeta: { title: 'Pagina', description: '' },
    createdBy: 'user-1',
  });
  return group;
}

/** Every block id in a tree, depth first. */
function idsOf(blocks: PageContent): string[] {
  return blocks.flatMap((block: Block) => [
    ...(block.id ? [block.id] : []),
    ...idsOf(block.children ?? []),
  ]);
}

describe('page templates', () => {
  describe('createPage, starting from a template', () => {
    const published: PageContent = [
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Plumbing in {{city}}' },
        children: [
          { id: 'button-1', type: 'Button', props: { label: 'Call' } },
        ],
      },
      {
        id: 'section-instance-1',
        type: 'Section',
        props: {
          section: { sectionId: 'newsletter', sectionName: 'Newsletter' },
          [sectionOverrideKey('title-1', 'text')]: 'Stay in touch',
        },
      },
    ];

    it('starts the page with a copy of what the template published, not its draft', async () => {
      const deps = setup();
      await seedSection(deps, {
        published,
        draft: [{ id: 'wip', type: 'Text', props: { body: 'half done' } }],
      });

      const group = await fromTemplate(deps, { templateId: 'template-1' });

      expect(group.content.map((block) => block.type)).toEqual([
        'Hero',
        'Section',
      ]);
      expect(group.content[0].props).toEqual({ title: 'Plumbing in {{city}}' });
      expect(group.content[0].children?.[0].props).toEqual({ label: 'Call' });
    });

    it('gives every copied block a new id, at every depth', async () => {
      const deps = setup();
      await seedSection(deps, { published });

      const first = await fromTemplate(deps, { templateId: 'template-1' });
      const second = await fromTemplate(deps, { templateId: 'template-1' });

      const templateIds = idsOf(published);
      expect(idsOf(first.content)).toHaveLength(templateIds.length);
      for (const id of idsOf(first.content)) {
        expect(templateIds).not.toContain(id);
        expect(idsOf(second.content)).not.toContain(id);
      }
    });

    /*
     * The user's case: a newsletter strip on every page made from a
     * template, changed in one place. That only holds if the copy keeps
     * pointing at the shared section, with the instance's own values.
     */
    it('keeps a shared section inside the template live on the new page', async () => {
      const deps = setup();
      await seedSection(deps, { published });

      const group = await fromTemplate(deps, { templateId: 'template-1' });

      expect(group.content[1].props).toEqual(published[1].props);
    });

    it('files the page where it was asked to, and records its first version', async () => {
      const deps = setup();
      await seedSection(deps, { published });

      const group = await fromTemplate(deps, {
        templateId: 'template-1',
        collectionId: 'collection-news',
      });

      expect(group.collectionId).toBe('collection-news');
      const versions = await deps.pageGroupVersionRepository.listByGroup(
        tenantId,
        group.id,
      );
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toEqual(group.content);
    });

    it('leaves the template exactly as it was', async () => {
      const deps = setup();
      const template = await seedSection(deps, { published });
      const before = structuredClone(template.toProps());

      await fromTemplate(deps, { templateId: 'template-1' });

      const after = await deps.reusableSectionRepository.findById(
        tenantId,
        'template-1',
      );
      expect(after?.toProps()).toEqual(before);
    });

    it('refuses a shared section: its promise is that it is never copied', async () => {
      const deps = setup();
      await seedSection(deps, { kind: 'shared', published });

      await expect(
        fromTemplate(deps, { templateId: 'template-1' }),
      ).rejects.toThrow(NotAPageTemplateError);
    });

    it('refuses a template nobody has published yet', async () => {
      const deps = setup();
      await seedSection(deps, { published: null, draft: published });

      await expect(
        fromTemplate(deps, { templateId: 'template-1' }),
      ).rejects.toThrow(NotAPageTemplateError);
    });

    it('answers "not found" for another site\'s template, another tenant\'s, or none', async () => {
      const deps = setup();
      await seedSection(deps, { id: 'elsewhere', siteId: 'site-2', published });
      await seedSection(deps, {
        id: 'foreign',
        tenantId: 'tenant-2',
        published,
      });

      for (const templateId of ['elsewhere', 'foreign', 'missing']) {
        await expect(fromTemplate(deps, { templateId })).rejects.toThrow(
          ReusableSectionNotFoundError,
        );
      }
      expect(
        await deps.pageGroupRepository.listSiblings(tenantId, siteId, null),
      ).toHaveLength(0);
    });
  });

  describe('savePageGroupAsTemplate', () => {
    const pageContent: PageContent = [
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Idraulico', align: 'left' },
      },
      { id: 'text-1', type: 'Text', props: { body: 'Chiamaci' } },
    ];

    /** An Italian-default site with a page in Italian and English. */
    async function seedBilingualPage(deps: Deps) {
      const group = await createPageGroup(deps, {
        tenantId,
        siteId,
        content: pageContent,
        createdBy: 'user-1',
      });
      const italian = await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'it',
        slug: 'idraulico',
        seoMeta: { title: 'Idraulico', description: '' },
        createdBy: 'user-1',
      });
      const english = await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'en',
        slug: 'plumber',
        seoMeta: { title: 'Plumber', description: '' },
        createdBy: 'user-1',
      });
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: english.id,
        fieldValues: { 'hero-1': { title: 'Plumber' } },
        actorUserId: 'user-1',
      });
      return { group, italian, english };
    }

    it('takes the default language, whichever one the page also has', async () => {
      const deps = setup();
      const { group } = await seedBilingualPage(deps);

      const template = await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      expect(template.content.map((block) => block.props)).toEqual([
        { title: 'Idraulico', align: 'left' },
        { body: 'Chiamaci' },
      ]);
    });

    it("takes the default language's own text when that language carries some", async () => {
      const deps = setup();
      const { group, italian } = await seedBilingualPage(deps);
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: italian.id,
        fieldValues: { 'text-1': { body: 'Chiamaci oggi' } },
        actorUserId: 'user-1',
      });

      const template = await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      expect(template.content[1].props).toEqual({ body: 'Chiamaci oggi' });
    });

    it("takes an unlinked default language's own blocks, not the shared structure", async () => {
      const deps = setup();
      const { group, italian } = await seedBilingualPage(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: italian.id,
        actorUserId: 'user-1',
      });
      await saveDivergedPageTranslationContent(deps, {
        tenantId,
        pageTranslationId: italian.id,
        content: [
          { id: 'only-it', type: 'Text', props: { body: 'Solo italiano' } },
        ],
        actorUserId: 'user-1',
      });

      const template = await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      expect(template.content.map((block) => block.props)).toEqual([
        { body: 'Solo italiano' },
      ]);
    });

    it('falls back to the shared structure for a page not yet in the default language', async () => {
      const deps = setup();
      const group = await createPageGroup(deps, {
        tenantId,
        siteId,
        content: pageContent,
        createdBy: 'user-1',
      });
      await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'en',
        slug: 'plumber',
        seoMeta: { title: 'Plumber', description: '' },
        createdBy: 'user-1',
      });

      const template = await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      expect(template.content.map((block) => block.props)).toEqual(
        pageContent.map((block) => block.props),
      );
    });

    it('is a published template at once, with ids of its own and a first version', async () => {
      const deps = setup();
      const { group } = await seedBilingualPage(deps);

      const template = await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      expect(template.kind).toBe('template');
      expect(template.status).toBe('published');
      expect(template.publishedContent).toEqual(template.content);
      expect(template.siteId).toBe(siteId);
      expect(template.createdBy).toBe('user-1');
      for (const id of idsOf(template.content)) {
        expect(idsOf(pageContent)).not.toContain(id);
      }
      const versions =
        await deps.reusableSectionVersionRepository.listBySection(
          tenantId,
          template.id,
        );
      expect(versions).toHaveLength(1);
    });

    it('leaves the page it was saved from untouched', async () => {
      const deps = setup();
      const { group } = await seedBilingualPage(deps);

      await savePageGroupAsTemplate(deps, {
        tenantId,
        pageGroupId: group.id,
        name: 'Service page',
        actorUserId: 'user-1',
      });

      const after = await deps.pageGroupRepository.findById(tenantId, group.id);
      expect(after?.content).toEqual(pageContent);
    });

    it('refuses a name another section of the site already has', async () => {
      const deps = setup();
      const { group } = await seedBilingualPage(deps);
      await seedSection(deps, { id: 'taken', published: [] });

      await expect(
        savePageGroupAsTemplate(deps, {
          tenantId,
          pageGroupId: group.id,
          name: 'Section taken',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(ReusableSectionNameAlreadyExistsError);
    });

    it('refuses a page that does not exist', async () => {
      const deps = setup();

      await expect(
        savePageGroupAsTemplate(deps, {
          tenantId,
          pageGroupId: 'missing',
          name: 'Service page',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });
});
