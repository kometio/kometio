import { describe, expect, it } from 'vitest';
import {
  PageGroupNotFoundError,
  PageGroupReorderMismatchError,
  PageGroupVersionNotFoundError,
  PageSlugAlreadyExistsError,
  PageSlugCollidesWithTermError,
  PageTranslationDivergedError,
  PageTranslationLocaleAlreadyExistsError,
  PageTranslationNotDivergedError,
  PageTranslationNotFoundError,
  PageTranslationVersionNotFoundError,
  Taxonomy,
  Term,
} from '@kometio/domain-core';
import { mergeTranslatedContent } from '@kometio/shared-types';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { savePageGroupContent } from './save-page-group-content.use-case';
import { savePageTranslationFieldValues } from './save-page-translation-field-values.use-case';
import { updatePageTranslationSeoMeta } from './update-page-translation-seo-meta.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { divergePageTranslation } from './diverge-page-translation.use-case';
import { saveDivergedPageTranslationContent } from './save-diverged-page-translation-content.use-case';
import { relinkPageTranslation } from './relink-page-translation.use-case';
import { rollbackPageTranslationToVersion } from './rollback-page-translation-to-version.use-case';
import { getPageGroupById } from './get-page-group-by-id.use-case';
import { deletePageGroup } from './delete-page-group.use-case';
import { listPageGroupTranslations } from './list-page-group-translations.use-case';
import { listPageGroupVersions } from './list-page-group-versions.use-case';
import { listPageTranslationVersions } from './list-page-translation-versions.use-case';
import { rollbackPageGroupToVersion } from './rollback-page-group-to-version.use-case';
import { reorderSiblingPageGroups } from './reorder-sibling-page-groups.use-case';
import { duplicatePageGroup } from './duplicate-page-group.use-case';
import {
  FakeContentSanitizer,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemoryTaxonomyRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryCollectionRepository,
  buildSite,
  buildCollection,
} from '@kometio/testing';

describe('page group i18n lifecycle', () => {
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
    return {
      pageGroupRepository,
      pageGroupVersionRepository,
      pageTranslationRepository,
      pageTranslationVersionRepository,
      searchPort: new InMemorySearchPort(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      // The site these pages live on, in every language they are written in.
      siteRepository: new InMemorySiteRepository(
        buildSite({ enabledLocales: ['it', 'en'] }),
      ),
      collectionRepository: new InMemoryCollectionRepository(
        buildCollection({ id: 'collection-news' }),
      ),
      // Leaves values as they are: what it does is the sanitiser's own
      // spec; here it only has to be asked, and with the right tree.
      contentSanitizer: new FakeContentSanitizer(),
    };
  }

  async function createGroupWithEnTranslation(deps: ReturnType<typeof setup>) {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId,
      content: [{ id: 'block-1', type: 'Hero', props: { title: 'Hello' } }],
      createdBy: 'user-1',
    });
    const translation = await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'en',
      slug: 'home',
      seoMeta: { title: 'Home', description: '' },
      createdBy: 'user-1',
    });
    return { group, translation };
  }

  describe('createPageGroup', () => {
    it('creates a group with the given content and records an initial version', async () => {
      const deps = setup();
      const group = await createPageGroup(deps, {
        tenantId,
        siteId,
        content: [{ type: 'Text', props: { body: 'ciao' } }],
        createdBy: 'user-1',
      });

      expect(group.content).toEqual([
        { type: 'Text', props: { body: 'ciao' } },
      ]);
      const versions = await deps.pageGroupVersionRepository.listByGroup(
        tenantId,
        group.id,
      );
      expect(versions).toHaveLength(1);
    });

    it('appends new siblings after existing ones', async () => {
      const deps = setup();
      const first = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const second = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });

      expect(first.order).toBe(0);
      expect(second.order).toBe(1);
    });
  });

  describe('createPageGroupTranslation', () => {
    it('creates a lightweight translation with empty fieldValues', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);

      expect(translation.locale).toBe('en');
      expect(translation.fieldValues).toEqual({});
      expect(translation.status).toBe('draft');
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        createPageGroupTranslation(deps, {
          tenantId,
          pageGroupId: 'does-not-exist',
          locale: 'en',
          slug: 'home',
          seoMeta: { title: '', description: '' },
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });

    it('throws PageTranslationLocaleAlreadyExistsError for a locale already in the group', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);

      await expect(
        createPageGroupTranslation(deps, {
          tenantId,
          pageGroupId: group.id,
          locale: 'en',
          slug: 'home-2',
          seoMeta: { title: '', description: '' },
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationLocaleAlreadyExistsError);
    });

    /*
     * The third place the address rule holds (docs/adr/0064). A page and
     * a root-mounted term are two different tables that meet only in the
     * URL, so nothing but this check stands between them — and without
     * it terms would refuse to land on pages while pages landed on terms
     * freely.
     */
    it('throws when a root-mounted term already answers at that address', async () => {
      const deps = setup();
      const group = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const taxonomy = Taxonomy.create({
        id: 'taxonomy-1',
        tenantId,
        siteId,
        prefix: null,
        name: { en: 'Family' },
      });
      await deps.taxonomyRepository.addTaxonomy(taxonomy);
      await deps.taxonomyRepository.addTerm(
        Term.create({
          id: 'term-1',
          tenantId,
          siteId,
          taxonomyId: taxonomy.id,
          name: { en: 'Espresso' },
          slugs: { en: 'espresso' },
        }),
      );

      await expect(
        createPageGroupTranslation(deps, {
          tenantId,
          pageGroupId: group.id,
          locale: 'en',
          slug: 'espresso',
          seoMeta: { title: '', description: '' },
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(PageSlugCollidesWithTermError);
    });

    it('throws PageSlugAlreadyExistsError for a slug taken under the same parent', async () => {
      const deps = setup();
      await createGroupWithEnTranslation(deps);
      const otherGroup = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });

      await expect(
        createPageGroupTranslation(deps, {
          tenantId,
          pageGroupId: otherGroup.id,
          locale: 'en',
          slug: 'home',
          seoMeta: { title: '', description: '' },
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(PageSlugAlreadyExistsError);
    });
  });

  describe('savePageGroupContent', () => {
    it('updates the shared draft structure and records a version', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);

      const updated = await savePageGroupContent(deps, {
        tenantId,
        pageGroupId: group.id,
        content: [{ type: 'Text', props: { body: 'nuovo blocco' } }],
        actorUserId: 'user-1',
      });

      expect(updated.content).toEqual([
        { type: 'Text', props: { body: 'nuovo blocco' } },
      ]);
      const versions = await deps.pageGroupVersionRepository.listByGroup(
        tenantId,
        group.id,
      );
      expect(versions).toHaveLength(2);
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        savePageGroupContent(deps, {
          tenantId,
          pageGroupId: 'does-not-exist',
          content: [],
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });

  describe('savePageTranslationFieldValues', () => {
    it('saves the overlay and records a version', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      const blockId = group.content[0]?.id;
      const fieldValues = blockId ? { [blockId]: { title: 'Ciao' } } : {};

      const updated = await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues,
        actorUserId: 'user-1',
      });

      expect(updated.fieldValues).toEqual(fieldValues);
      const versions =
        await deps.pageTranslationVersionRepository.listByTranslation(
          tenantId,
          translation.id,
        );
      expect(versions).toHaveLength(1);
    });

    it("cleans the overlay against its own group's tree, and keeps what the cleaner returns", async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      const contentSanitizer = new FakeContentSanitizer({
        'block-1': { title: 'cleaned' },
      });
      deps.contentSanitizer = contentSanitizer;

      const updated = await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: '<script>x</script>' } },
        actorUserId: 'user-1',
      });

      expect(contentSanitizer.asked).toEqual([group.content]);
      expect(updated.fieldValues).toEqual({ 'block-1': { title: 'cleaned' } });
    });

    it('throws PageTranslationNotFoundError for a nonexistent translation', async () => {
      const deps = setup();

      await expect(
        savePageTranslationFieldValues(deps, {
          tenantId,
          pageTranslationId: 'does-not-exist',
          fieldValues: {},
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationNotFoundError);
    });

    it('throws PageTranslationDivergedError once the translation has diverged', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      await expect(
        savePageTranslationFieldValues(deps, {
          tenantId,
          pageTranslationId: translation.id,
          fieldValues: {},
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationDivergedError);
    });
  });

  describe('updatePageTranslationSeoMeta', () => {
    it('updates seoMeta without creating a new version', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);

      const updated = await updatePageTranslationSeoMeta(deps, {
        tenantId,
        pageTranslationId: translation.id,
        seoMeta: { title: 'New title', description: 'New description' },
        actorUserId: null,
      });

      expect(updated.seoMeta).toEqual({
        title: 'New title',
        description: 'New description',
      });
      const versions =
        await deps.pageTranslationVersionRepository.listByTranslation(
          tenantId,
          translation.id,
        );
      expect(versions).toHaveLength(0);
    });
  });

  describe('publishPageTranslation', () => {
    it('freezes the merge of group content and fieldValues as publishedSnapshot', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      const blockId = group.content[0]?.id;
      const fieldValues = blockId ? { [blockId]: { title: 'Ciao' } } : {};
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues,
        actorUserId: 'user-1',
      });

      const published = await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: null,
      });

      expect(published.status).toBe('published');
      expect(published.publishedSnapshot).toEqual(
        mergeTranslatedContent(group.content, fieldValues),
      );
    });

    it('freezes divergedContent as-is for a diverged translation', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      const diverged = await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      const published = await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: null,
      });

      expect(published.publishedSnapshot).toEqual(diverged.divergedContent);
    });

    it('throws PageTranslationNotFoundError for a nonexistent translation', async () => {
      const deps = setup();

      await expect(
        publishPageTranslation(deps, {
          tenantId,
          pageTranslationId: 'does-not-exist',
          actorUserId: null,
        }),
      ).rejects.toThrow(PageTranslationNotFoundError);
    });
  });

  describe('divergePageTranslation', () => {
    it('forks the current merge into divergedContent and flips isDiverged', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);

      const diverged = await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      expect(diverged.isDiverged).toBe(true);
      expect(diverged.divergedContent).toEqual(
        mergeTranslatedContent(group.content, translation.fieldValues),
      );
    });

    it('records a version holding the fork', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);

      const diverged = await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      const versions = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      expect(versions.at(-1)?.divergedContent).toEqual(
        diverged.divergedContent,
      );
    });

    it('throws PageTranslationDivergedError if already diverged', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      await expect(
        divergePageTranslation(deps, {
          tenantId,
          pageTranslationId: translation.id,
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationDivergedError);
    });

    it('subsequent group content changes no longer reach it', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      const beforeDivergedContent = (
        await deps.pageTranslationRepository.findById(tenantId, translation.id)
      )?.divergedContent;

      await savePageGroupContent(deps, {
        tenantId,
        pageGroupId: group.id,
        content: [{ type: 'Text', props: { body: 'structural change' } }],
        actorUserId: 'user-1',
      });

      const after = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(after?.divergedContent).toEqual(beforeDivergedContent);
    });
  });

  describe('saveDivergedPageTranslationContent', () => {
    it('saves independent content on an already-diverged translation', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      const updated = await saveDivergedPageTranslationContent(deps, {
        tenantId,
        pageTranslationId: translation.id,
        content: [{ type: 'Text', props: { body: 'diverged edit' } }],
        actorUserId: null,
      });

      expect(updated.divergedContent).toEqual([
        { type: 'Text', props: { body: 'diverged edit' } },
      ]);
    });

    /*
     * The fork used to have no history at all: the row was the only copy
     * of an unlinked language's work, and relinking would have been the
     * end of it.
     */
    it('records every save as a version', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });

      await saveDivergedPageTranslationContent(deps, {
        tenantId,
        pageTranslationId: translation.id,
        content: [{ type: 'Text', props: { body: 'diverged edit' } }],
        actorUserId: 'user-2',
      });

      const versions = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      expect(versions).toHaveLength(2);
      expect(versions.at(-1)).toMatchObject({
        divergedContent: [{ type: 'Text', props: { body: 'diverged edit' } }],
        createdBy: 'user-2',
      });
    });

    it('throws PageTranslationNotDivergedError on a translation still linked to the shared structure', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);

      await expect(
        saveDivergedPageTranslationContent(deps, {
          tenantId,
          pageTranslationId: translation.id,
          content: [],
          actorUserId: null,
        }),
      ).rejects.toThrow(PageTranslationNotDivergedError);
    });

    it('throws PageTranslationNotFoundError for a nonexistent translation', async () => {
      const deps = setup();

      await expect(
        saveDivergedPageTranslationContent(deps, {
          tenantId,
          pageTranslationId: 'does-not-exist',
          content: [],
          actorUserId: null,
        }),
      ).rejects.toThrow(PageTranslationNotFoundError);
    });
  });

  describe('relinkPageTranslation', () => {
    async function divergedWithOwnText(deps: ReturnType<typeof setup>) {
      const { group, translation } = await createGroupWithEnTranslation(deps);
      await divergePageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: 'user-1',
      });
      await saveDivergedPageTranslationContent(deps, {
        tenantId,
        pageTranslationId: translation.id,
        content: [
          { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
          { id: 'only-here', type: 'Text', props: { body: 'Solo qui' } },
        ],
        actorUserId: 'user-1',
      });
      return { group, translation };
    }

    it('follows the shared structure again, with the text it is given', async () => {
      const deps = setup();
      const { group, translation } = await divergedWithOwnText(deps);

      const relinked = await relinkPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: 'Ciao' } },
        actorUserId: 'user-2',
      });

      expect(relinked.isDiverged).toBe(false);
      expect(relinked.divergedContent).toBeNull();
      expect(relinked.currentContent(group.content)).toEqual([
        { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
      ]);
      const stored = await deps.pageTranslationRepository.findById(
        tenantId,
        translation.id,
      );
      expect(stored?.isDiverged).toBe(false);
      expect(stored?.updatedBy).toBe('user-2');
    });

    it("cleans the text it is given against the group's tree", async () => {
      const deps = setup();
      const { group, translation } = await divergedWithOwnText(deps);
      const contentSanitizer = new FakeContentSanitizer({
        'block-1': { title: 'cleaned' },
      });
      deps.contentSanitizer = contentSanitizer;

      const relinked = await relinkPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: '<script>x</script>' } },
        actorUserId: 'user-1',
      });

      expect(contentSanitizer.asked).toEqual([group.content]);
      expect(relinked.fieldValues).toEqual({ 'block-1': { title: 'cleaned' } });
    });

    it('leaves the fork in the history, so restoring it unlinks the language again', async () => {
      const deps = setup();
      const { translation } = await divergedWithOwnText(deps);
      await relinkPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: 'Ciao' } },
        actorUserId: 'user-1',
      });
      const versions = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      const beforeRelink = versions.at(-2);
      expect(versions.at(-1)?.divergedContent).toBeNull();

      const restored = await rollbackPageTranslationToVersion(deps, {
        tenantId,
        pageTranslationId: translation.id,
        versionId: beforeRelink?.id ?? '',
        actorUserId: 'user-1',
      });

      expect(restored.isDiverged).toBe(true);
      expect(restored.divergedContent).toEqual([
        { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
        { id: 'only-here', type: 'Text', props: { body: 'Solo qui' } },
      ]);
    });

    it('throws PageTranslationNotDivergedError on a translation still linked', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);

      await expect(
        relinkPageTranslation(deps, {
          tenantId,
          pageTranslationId: translation.id,
          fieldValues: {},
          actorUserId: null,
        }),
      ).rejects.toThrow(PageTranslationNotDivergedError);
    });

    it('throws PageTranslationNotFoundError for a nonexistent translation', async () => {
      const deps = setup();

      await expect(
        relinkPageTranslation(deps, {
          tenantId,
          pageTranslationId: 'does-not-exist',
          fieldValues: {},
          actorUserId: null,
        }),
      ).rejects.toThrow(PageTranslationNotFoundError);
    });
  });

  describe('rollbackPageTranslationToVersion', () => {
    it('restores the text of a previous version and records the restore as a new one', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: 'First' } },
        actorUserId: 'user-1',
      });
      const [first] = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: { 'block-1': { title: 'Second' } },
        actorUserId: 'user-1',
      });

      const restored = await rollbackPageTranslationToVersion(deps, {
        tenantId,
        pageTranslationId: translation.id,
        versionId: first.id,
        actorUserId: 'user-1',
      });

      expect(restored.fieldValues).toEqual({ 'block-1': { title: 'First' } });
      expect(restored.isDiverged).toBe(false);
      const versions = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      expect(versions).toHaveLength(3);
    });

    it('keeps the SEO fields as they are now', async () => {
      const deps = setup();
      const { translation } = await createGroupWithEnTranslation(deps);
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: {},
        actorUserId: 'user-1',
      });
      const [first] = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });
      await updatePageTranslationSeoMeta(deps, {
        tenantId,
        pageTranslationId: translation.id,
        seoMeta: { title: 'Renamed', description: '' },
        actorUserId: 'user-1',
      });

      const restored = await rollbackPageTranslationToVersion(deps, {
        tenantId,
        pageTranslationId: translation.id,
        versionId: first.id,
        actorUserId: 'user-1',
      });

      expect(restored.seoMeta.title).toBe('Renamed');
    });

    it("throws PageTranslationVersionNotFoundError for another language's version", async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      const italian = await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'it',
        slug: 'home',
        seoMeta: { title: 'Home', description: '' },
        createdBy: 'user-1',
      });
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: italian.id,
        fieldValues: {},
        actorUserId: 'user-1',
      });
      const [italianVersion] = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: italian.id,
      });

      await expect(
        rollbackPageTranslationToVersion(deps, {
          tenantId,
          pageTranslationId: translation.id,
          versionId: italianVersion.id,
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationVersionNotFoundError);
    });

    it('throws PageTranslationNotFoundError for a nonexistent translation', async () => {
      const deps = setup();

      await expect(
        rollbackPageTranslationToVersion(deps, {
          tenantId,
          pageTranslationId: 'does-not-exist',
          versionId: 'irrelevant',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageTranslationNotFoundError);
    });
  });

  describe('getPageGroupById', () => {
    it('returns the group', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);

      const found = await getPageGroupById(deps, {
        tenantId,
        pageGroupId: group.id,
      });

      expect(found.id).toBe(group.id);
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        getPageGroupById(deps, { tenantId, pageGroupId: 'does-not-exist' }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });

  describe('deletePageGroup', () => {
    it('deletes the group', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);

      await deletePageGroup(deps, {
        tenantId,
        pageGroupId: group.id,
        actorUserId: null,
      });

      await expect(
        getPageGroupById(deps, { tenantId, pageGroupId: group.id }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        deletePageGroup(deps, {
          tenantId,
          pageGroupId: 'does-not-exist',
          actorUserId: null,
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });

  describe('listPageGroupTranslations', () => {
    it('lists every translation in the group', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      const itTranslation = await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: group.id,
        locale: 'it',
        slug: 'home-it',
        seoMeta: { title: 'Home', description: '' },
        createdBy: 'user-1',
      });

      const results = await listPageGroupTranslations(deps, {
        tenantId,
        pageGroupId: group.id,
      });

      expect(results.map((t) => t.id).sort()).toEqual(
        [translation.id, itTranslation.id].sort(),
      );
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        listPageGroupTranslations(deps, {
          tenantId,
          pageGroupId: 'does-not-exist',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });

  describe('listPageGroupVersions / listPageTranslationVersions', () => {
    it('lists every recorded version for a group and for a translation', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      await savePageGroupContent(deps, {
        tenantId,
        pageGroupId: group.id,
        content: [{ type: 'Text', props: { body: 'v2' } }],
        actorUserId: 'user-1',
      });
      await savePageTranslationFieldValues(deps, {
        tenantId,
        pageTranslationId: translation.id,
        fieldValues: {},
        actorUserId: 'user-1',
      });

      const groupVersions = await listPageGroupVersions(deps, {
        tenantId,
        pageGroupId: group.id,
      });
      const translationVersions = await listPageTranslationVersions(deps, {
        tenantId,
        pageTranslationId: translation.id,
      });

      expect(groupVersions).toHaveLength(2);
      expect(translationVersions).toHaveLength(1);
    });
  });

  describe('rollbackPageGroupToVersion', () => {
    it('restores the content of a previous version and records the rollback as a new one', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);
      const [initialVersion] =
        await deps.pageGroupVersionRepository.listByGroup(tenantId, group.id);
      await savePageGroupContent(deps, {
        tenantId,
        pageGroupId: group.id,
        content: [{ type: 'Text', props: { body: 'v2' } }],
        actorUserId: 'user-1',
      });

      const restored = await rollbackPageGroupToVersion(deps, {
        tenantId,
        pageGroupId: group.id,
        versionId: initialVersion.id,
        actorUserId: 'user-1',
      });

      expect(restored.content).toEqual([
        { id: 'block-1', type: 'Hero', props: { title: 'Hello' } },
      ]);
      const versions = await deps.pageGroupVersionRepository.listByGroup(
        tenantId,
        group.id,
      );
      // initial create + the v2 save + the rollback itself, never a
      // destructive overwrite of history.
      expect(versions).toHaveLength(3);
    });

    it('throws PageGroupNotFoundError for a nonexistent group', async () => {
      const deps = setup();

      await expect(
        rollbackPageGroupToVersion(deps, {
          tenantId,
          pageGroupId: 'does-not-exist',
          versionId: 'irrelevant',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });

    it('throws PageGroupVersionNotFoundError for a nonexistent version', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);

      await expect(
        rollbackPageGroupToVersion(deps, {
          tenantId,
          pageGroupId: group.id,
          versionId: 'does-not-exist',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageGroupVersionNotFoundError);
    });

    it('throws PageGroupVersionNotFoundError for a version belonging to another group', async () => {
      const deps = setup();
      const { group: groupA } = await createGroupWithEnTranslation(deps);
      const groupB = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const [versionOfB] = await deps.pageGroupVersionRepository.listByGroup(
        tenantId,
        groupB.id,
      );

      await expect(
        rollbackPageGroupToVersion(deps, {
          tenantId,
          pageGroupId: groupA.id,
          versionId: versionOfB.id,
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(PageGroupVersionNotFoundError);
    });
  });

  describe('reorderSiblingPageGroups', () => {
    it('reassigns order to match the given permutation', async () => {
      const deps = setup();
      const a = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const b = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const c = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);

      await reorderSiblingPageGroups(deps, {
        tenantId,
        siteId,
        parentId: null,
        orderedPageGroupIds: [c.id, a.id, b.id],
        actorUserId: null,
      });

      const siblings = await deps.pageGroupRepository.listSiblings(
        tenantId,
        siteId,
        null,
      );
      const byId = new Map(siblings.map((s) => [s.id, s.order]));
      expect(byId.get(c.id)).toBe(0);
      expect(byId.get(a.id)).toBe(1);
      expect(byId.get(b.id)).toBe(2);
    });

    it('throws PageGroupReorderMismatchError for a list missing a real sibling', async () => {
      const deps = setup();
      const a = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      await createPageGroup(deps, { tenantId, siteId, createdBy: 'user-1' });

      await expect(
        reorderSiblingPageGroups(deps, {
          tenantId,
          siteId,
          parentId: null,
          orderedPageGroupIds: [a.id],
          actorUserId: null,
        }),
      ).rejects.toThrow(PageGroupReorderMismatchError);
    });

    it('throws PageGroupReorderMismatchError for a list containing a foreign id', async () => {
      const deps = setup();
      const a = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });
      const b = await createPageGroup(deps, {
        tenantId,
        siteId,
        createdBy: 'user-1',
      });

      await expect(
        reorderSiblingPageGroups(deps, {
          tenantId,
          siteId,
          parentId: null,
          orderedPageGroupIds: [a.id, b.id, 'does-not-exist'],
          actorUserId: null,
        }),
      ).rejects.toThrow(PageGroupReorderMismatchError);
    });
  });

  describe('duplicatePageGroup', () => {
    it('copies the shared content and every translation, each as a fresh draft with a suffixed slug', async () => {
      const deps = setup();
      const { group, translation } = await createGroupWithEnTranslation(deps);
      await publishPageTranslation(deps, {
        tenantId,
        pageTranslationId: translation.id,
        actorUserId: null,
      });

      const result = await duplicatePageGroup(deps, {
        tenantId,
        sourceGroupId: group.id,
        createdBy: 'user-2',
      });

      expect(result.group.id).not.toBe(group.id);
      expect(result.group.content).toEqual(group.content);
      expect(result.group.parentId).toBe(group.parentId);
      expect(result.group.order).toBe(1);
      expect(result.translations).toHaveLength(1);
      const [duplicatedTranslation] = result.translations;
      expect(duplicatedTranslation.id).not.toBe(translation.id);
      expect(duplicatedTranslation.locale).toBe('en');
      expect(duplicatedTranslation.slug).toBe('home-copy');
      expect(duplicatedTranslation.seoMeta).toEqual(translation.seoMeta);
      expect(duplicatedTranslation.status).toBe('draft');
      expect(duplicatedTranslation.publishedSnapshot).toBeNull();
    });

    it('keeps the copy in the collection the original is listed in', async () => {
      const deps = setup();
      const article = await createPageGroup(deps, {
        tenantId,
        siteId,
        collectionId: 'collection-news',
        createdBy: 'user-1',
      });
      await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: article.id,
        locale: 'en',
        slug: 'launch',
        seoMeta: { title: 'Launch', description: '' },
        createdBy: 'user-1',
      });

      const result = await duplicatePageGroup(deps, {
        tenantId,
        sourceGroupId: article.id,
        createdBy: 'user-1',
      });

      // Duplicated from the News screen, the copy has to be on the News
      // screen — not filed under Pages, where nobody looking for it would.
      expect(result.group.collectionId).toBe('collection-news');
    });

    it('picks a further-suffixed slug when the first candidate is already taken', async () => {
      const deps = setup();
      const { group } = await createGroupWithEnTranslation(deps);
      // Pre-occupy the slug the first duplicate would otherwise land on.
      await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: (
          await createPageGroup(deps, { tenantId, siteId, createdBy: 'user-1' })
        ).id,
        locale: 'en',
        slug: 'home-copy',
        seoMeta: { title: 'Taken', description: '' },
        createdBy: 'user-1',
      });

      const result = await duplicatePageGroup(deps, {
        tenantId,
        sourceGroupId: group.id,
        createdBy: 'user-1',
      });

      expect(result.translations[0].slug).toBe('home-copy-2');
    });

    it('throws PageGroupNotFoundError for a nonexistent source group', async () => {
      const deps = setup();

      await expect(
        duplicatePageGroup(deps, {
          tenantId,
          sourceGroupId: 'does-not-exist',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(PageGroupNotFoundError);
    });
  });
});
