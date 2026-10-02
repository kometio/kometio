import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  type KometioDb,
  collections,
  reusableSections,
  withTenant,
} from '@kometio/postgres-db';
import { CollectionsModule } from '../collections/collections.module';
import { ReusableSectionsModule } from '../reusable-sections/reusable-sections.module';
import { PagesModule } from './pages.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres, through the real HTTP stack — same setup
 * discipline as pages.controller.integration.spec.ts (see its own doc
 * comment for why a throwaway site is created per run instead of reusing
 * the dev seed). Deleting the site cascades to page_groups ->
 * page_translations -> both version tables (schema.ts), so the site
 * IntegrationApp.close() deletes takes everything with it.
 */
describe('PageGroupsController (integration)', () => {
  let integration: IntegrationApp;
  let db: KometioDb;
  let tenantId: string;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      // Collections and sections too, for the rule that spans all three:
      // the template a collection preselects must be one a page can start
      // from, and deleting it must take only the suggestion away.
      imports: [PagesModule, CollectionsModule, ReusableSectionsModule],
    });
    ({ db, tenantId } = integration);
    siteId = await integration.createSite({
      defaultLocale: 'en',
      enabledLocales: ['en', 'it', 'fr'],
    });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  it('runs the full create group -> translate -> save -> publish -> diverge cycle over HTTP', async () => {
    const createGroupRes = await agent
      .post('/page-groups')
      .send({ siteId })
      .expect(201);
    expect(createGroupRes.body.content).toEqual([]);
    const groupId = createGroupRes.body.id;

    const contentRes = await agent
      .patch(`/page-groups/${groupId}/content`)
      .send({
        content: [{ id: 'block-1', type: 'Hero', props: { title: 'Hello' } }],
      })
      .expect(200);
    expect(contentRes.body.content).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Hello' } },
    ]);

    const enTranslationRes = await agent
      .post(`/page-groups/${groupId}/translations`)
      .send({
        locale: 'en',
        slug: `home-${randomUUID()}`,
        seoMeta: { title: 'Home', description: '' },
      })
      .expect(201);
    expect(enTranslationRes.body.fieldValues).toEqual({});
    const enTranslationId = enTranslationRes.body.id;

    const itTranslationRes = await agent
      .post(`/page-groups/${groupId}/translations`)
      .send({
        locale: 'it',
        slug: `home-it-${randomUUID()}`,
        seoMeta: { title: 'Home', description: '' },
      })
      .expect(201);
    const itTranslationId = itTranslationRes.body.id;

    const fieldValuesRes = await agent
      .patch(`/page-groups/translations/${itTranslationId}/field-values`)
      .send({
        fieldValues: { 'block-1': { title: 'Ciao' } },
        parentGroupId: null,
      })
      .expect(200);
    expect(fieldValuesRes.body.fieldValues).toEqual({
      'block-1': { title: 'Ciao' },
    });

    const publishItRes = await agent
      .post(`/page-groups/translations/${itTranslationId}/publish`)
      .expect(201);
    expect(publishItRes.body.status).toBe('published');
    expect(publishItRes.body.publishedSnapshot).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);

    // en never got a fieldValues overlay — publishing it must still fall
    // back to the group's own (default-locale) content untouched.
    const publishEnRes = await agent
      .post(`/page-groups/translations/${enTranslationId}/publish`)
      .expect(201);
    expect(publishEnRes.body.publishedSnapshot).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Hello' } },
    ]);

    const listRes = await agent
      .get(`/page-groups/${groupId}/translations`)
      .expect(200);
    expect(listRes.body.map((t: { id: string }) => t.id).sort()).toEqual(
      [enTranslationId, itTranslationId].sort(),
    );

    const divergeRes = await agent
      .post(`/page-groups/translations/${itTranslationId}/diverge`)
      .expect(201);
    expect(divergeRes.body.isDiverged).toBe(true);
    expect(divergeRes.body.divergedContent).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);

    // Once diverged, a structural change to the group must not reach it.
    await agent
      .patch(`/page-groups/${groupId}/content`)
      .send({
        content: [
          { id: 'block-1', type: 'Hero', props: { title: 'Hello v2' } },
        ],
      })
      .expect(200);
    const stillDivergedRes = await agent
      .get(`/page-groups/${groupId}/translations`)
      .expect(200);
    const itAfter = stillDivergedRes.body.find(
      (t: { id: string }) => t.id === itTranslationId,
    );
    expect(itAfter.divergedContent).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);

    const groupVersionsRes = await agent
      .get(`/page-groups/${groupId}/versions`)
      .expect(200);
    // create + 2 saveContent calls; publish/diverge/translations never write
    // a PageGroupVersion.
    expect(groupVersionsRes.body).toHaveLength(3);

    const translationVersionsRes = await agent
      .get(`/page-groups/translations/${itTranslationId}/versions`)
      .expect(200);
    // saveFieldValues + diverge; createTranslation/publish never write a
    // PageTranslationVersion (see savePageTranslationFieldValues vs.
    // updatePageTranslationSeoMeta's plain save).
    expect(translationVersionsRes.body).toHaveLength(2);
  });

  it('deletes a group, over the real HTTP endpoint', async () => {
    const groupRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `cancellare-${randomUUID()}`,
        seoMeta: { title: 'Da cancellare', description: '' },
      })
      .expect(201);

    await agent.delete(`/page-groups/${groupRes.body.id}`).expect(204);

    await agent.get(`/page-groups/${groupRes.body.id}`).expect(404);
  });

  describe('deleting a page that has subpages, over the real HTTP endpoint', () => {
    /** A page with one language, under `parentId`. */
    async function pageWith(slug: string, parentId?: string) {
      const group = await agent
        .post('/page-groups')
        .send({ siteId, content: [], ...(parentId ? { parentId } : {}) })
        .expect(201);
      await agent
        .post(`/page-groups/${group.body.id}/translations`)
        .send({
          locale: 'it',
          slug,
          seoMeta: { title: slug, description: '' },
        })
        .expect(201);
      return group.body.id as string;
    }
    const parentOf = async (id: string) =>
      (await agent.get(`/page-groups/${id}`).expect(200)).body.parentId;

    it('moves the subpages to the top level, where their language answers, and deletes the page', async () => {
      const suffix = randomUUID().slice(0, 8);
      const services = await pageWith(`servizi-${suffix}`);
      const plumbing = await pageWith(`idraulica-${suffix}`, services);
      const faucets = await pageWith(`rubinetti-${suffix}`, plumbing);

      await agent.delete(`/page-groups/${services}`).expect(204);

      await agent.get(`/page-groups/${services}`).expect(404);
      expect(await parentOf(plumbing)).toBeNull();
      // What was under the subpage stays under it.
      expect(await parentOf(faucets)).toBe(plumbing);
      // The translation row's own copy of the parent moved in the same
      // write: asked for the top-level tree, the subpage is there.
      const tree = await agent
        .get('/page-groups')
        .query({ siteId, locale: 'it' })
        .expect(200);
      const listed = tree.body.items.find(
        (item: { id: string }) => item.id === plumbing,
      );
      expect(listed?.parentId).toBeNull();
    });

    it('409s naming the address when a subpage’s is already taken at the top level, and deletes and moves nothing', async () => {
      const suffix = randomUUID().slice(0, 8);
      const services = await pageWith(`servizi-${suffix}`);
      const heating = await pageWith(`riscaldamento-${suffix}`, services);
      await pageWith(`riscaldamento-${suffix}`);

      const res = await agent.delete(`/page-groups/${services}`).expect(409);

      expect(res.body.message).toContain(`riscaldamento-${suffix}`);
      expect(res.body.message).toContain('(it)');
      await agent.get(`/page-groups/${services}`).expect(200);
      expect(await parentOf(heating)).toBe(services);
    });
  });

  it('rolls back a group to a previous version, over the real HTTP endpoint', async () => {
    const groupRes = await agent
      .post('/page-groups')
      .send({
        siteId,
        content: [{ id: 'block-1', type: 'Hero', props: { title: 'V1' } }],
      })
      .expect(201);
    const groupId = groupRes.body.id;
    const [initialVersion] = (
      await agent.get(`/page-groups/${groupId}/versions`).expect(200)
    ).body;

    await agent
      .patch(`/page-groups/${groupId}/content`)
      .send({
        content: [{ id: 'block-1', type: 'Hero', props: { title: 'V2' } }],
      })
      .expect(200);

    const rollbackRes = await agent
      .patch(`/page-groups/${groupId}/rollback`)
      .send({ versionId: initialVersion.id })
      .expect(200);
    expect(rollbackRes.body.content).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'V1' } },
    ]);

    const versionsAfterRollback = await agent
      .get(`/page-groups/${groupId}/versions`)
      .expect(200);
    // create + saveContent(V2) + the rollback itself — history is never
    // overwritten, only appended to.
    expect(versionsAfterRollback.body).toHaveLength(3);

    await agent
      .patch(`/page-groups/${groupId}/rollback`)
      .send({ versionId: randomUUID() })
      .expect(404);
  });

  // Every id in a path is checked before the database sees it; a malformed
  // one used to come back as a 500 from Postgres.
  it('400s ids that are not uuids, the page and the translation alike', async () => {
    await agent.get('/page-groups/not-a-uuid').expect(400);
    await agent
      .post('/page-groups/translations/not-a-uuid/publish')
      .expect(400);
  });

  /*
   * An unlinked language used to be a one-way door with no history: its
   * own tree was the only copy of its work. ADR-0075 opens the way back
   * and keeps every step of the fork in the history.
   */
  it('relinks an unlinked language and restores the fork from its history, over HTTP', async () => {
    const groupRes = await agent
      .post('/page-groups')
      .send({
        siteId,
        content: [
          { id: 'hero-1', type: 'Hero', props: { title: 'Hello' } },
          { id: 'text-1', type: 'Text', props: { body: '<p>Hello</p>' } },
        ],
      })
      .expect(201);
    const itRes = await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `ricollega-${randomUUID()}`,
        seoMeta: { title: 'Ricollega', description: '' },
      })
      .expect(201);
    const translationId = itRes.body.id;
    await agent
      .post(`/page-groups/translations/${translationId}/diverge`)
      .expect(201);
    const fork = [
      { id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } },
      { id: 'only-here', type: 'Text', props: { body: '<p>Solo qui</p>' } },
    ];
    await agent
      .patch(`/page-groups/translations/${translationId}/diverged-content`)
      .send({ content: fork, parentGroupId: null })
      .expect(200);

    const relinkRes = await agent
      .post(`/page-groups/translations/${translationId}/relink`)
      .send({
        fieldValues: {
          'hero-1': { title: 'Ciao' },
          'text-1': { body: '<p>Ciao</p><script>alert(1)</script>' },
        },
      })
      .expect(201);
    expect(relinkRes.body.isDiverged).toBe(false);
    expect(relinkRes.body.divergedContent).toBeNull();
    expect(relinkRes.body.fieldValues['hero-1']).toEqual({ title: 'Ciao' });
    // The overlay goes through the same sanitiser as any other save of a
    // language's text: a rich text field keeps its markup, never a script.
    expect(relinkRes.body.fieldValues['text-1'].body).toBe('<p>Ciao</p>');

    await agent
      .post(`/page-groups/translations/${translationId}/relink`)
      .send({ fieldValues: {} })
      .expect(409);

    const versionsRes = await agent
      .get(`/page-groups/translations/${translationId}/versions`)
      .expect(200);
    // diverge + the save of the fork + the relink.
    expect(versionsRes.body).toHaveLength(3);
    const forkVersion = versionsRes.body[1];
    expect(forkVersion.divergedContent).toEqual(fork);
    expect(versionsRes.body[2].divergedContent).toBeNull();

    const restoreRes = await agent
      .patch(`/page-groups/translations/${translationId}/rollback`)
      .send({ versionId: forkVersion.id })
      .expect(200);
    expect(restoreRes.body.isDiverged).toBe(true);
    expect(restoreRes.body.divergedContent).toEqual(fork);

    await agent
      .patch(`/page-groups/translations/${translationId}/rollback`)
      .send({ versionId: randomUUID() })
      .expect(404);
  });

  it('reorders a sibling group of page groups, over the real HTTP endpoint', async () => {
    // Scoped under a fresh parent (not root) so this test's sibling group
    // is isolated from every other group any other test in this file
    // creates at the root level — reorder validates an EXACT permutation
    // of the real sibling group, so it can't tolerate unrelated siblings.
    const parentRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    const parentId = parentRes.body.id;
    const childA = await agent
      .post('/page-groups')
      .send({ siteId, parentId, content: [] })
      .expect(201);
    const childB = await agent
      .post('/page-groups')
      .send({ siteId, parentId, content: [] })
      .expect(201);
    const childC = await agent
      .post('/page-groups')
      .send({ siteId, parentId, content: [] })
      .expect(201);

    await agent
      .patch('/page-groups/reorder')
      .send({
        siteId,
        parentId,
        orderedPageGroupIds: [childC.body.id, childA.body.id, childB.body.id],
      })
      .expect(204);

    const reorderedA = await agent
      .get(`/page-groups/${childA.body.id}`)
      .expect(200);
    const reorderedB = await agent
      .get(`/page-groups/${childB.body.id}`)
      .expect(200);
    const reorderedC = await agent
      .get(`/page-groups/${childC.body.id}`)
      .expect(200);
    expect(reorderedC.body.order).toBe(0);
    expect(reorderedA.body.order).toBe(1);
    expect(reorderedB.body.order).toBe(2);

    await agent
      .patch('/page-groups/reorder')
      .send({
        siteId,
        parentId,
        orderedPageGroupIds: [childA.body.id],
      })
      .expect(400);
  });

  /*
   * What the parent picker asks for, over the real query string: a page
   * cannot move inside its own child, and the list has to say so by not
   * offering it (ADR-0074). The picker cannot work this out itself — a
   * page found by searching arrives without its ancestors.
   */
  it('leaves a page and its descendants out of the list when asked to', async () => {
    const root = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    const child = await agent
      .post('/page-groups')
      .send({ siteId, content: [], parentId: root.body.id })
      .expect(201);
    const other = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);

    const listed = await agent
      .get('/page-groups')
      .query({ siteId, pageSize: 100, excludeSubtreeOf: root.body.id })
      .expect(200);

    const ids = listed.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(other.body.id);
    expect(ids).not.toContain(root.body.id);
    expect(ids).not.toContain(child.body.id);
  });

  /*
   * The move a page's address depends on: the language rows carry the
   * parent too, so this is also the check that the group and its
   * languages end up agreeing about where the page lives.
   */
  it('moves a page under another one, and refuses a ring, over the real HTTP endpoint', async () => {
    const services = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    const plumbing = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    await agent
      .post(`/page-groups/${plumbing.body.id}/translations`)
      .send({
        locale: 'en',
        slug: `plumbing-${randomUUID()}`,
        seoMeta: { title: 'Plumbing', description: '' },
      })
      .expect(201);

    await agent
      .patch(`/page-groups/${plumbing.body.id}/parent`)
      .send({ parentId: services.body.id })
      .expect(200);

    const moved = await agent
      .get(`/page-groups/${plumbing.body.id}`)
      .expect(200);
    expect(moved.body.parentId).toBe(services.body.id);

    // Its language went with it: asked for the tree under the new parent,
    // the page is there — which only works if the translation row's own
    // parent was rewritten in the same transaction.
    const tree = await agent
      .get('/page-groups')
      .query({ siteId, locale: 'en' })
      .expect(200);
    const listed = tree.body.items.find(
      (item: { id: string }) => item.id === plumbing.body.id,
    );
    expect(listed?.parentId).toBe(services.body.id);

    await agent
      .patch(`/page-groups/${services.body.id}/parent`)
      .send({ parentId: plumbing.body.id })
      .expect(400);
  });

  it('duplicates a group with every translation, over the real HTTP endpoint', async () => {
    const groupRes = await agent
      .post('/page-groups')
      .send({
        siteId,
        content: [{ id: 'block-1', type: 'Hero', props: { title: 'Ciao' } }],
      })
      .expect(201);
    const groupId = groupRes.body.id;
    const originalSlug = `idraulico-duplica-${randomUUID()}`;
    await agent
      .post(`/page-groups/${groupId}/translations`)
      .send({
        locale: 'it',
        slug: originalSlug,
        seoMeta: { title: 'Idraulico', description: '' },
      })
      .expect(201);
    const frTranslationRes = await agent
      .post(`/page-groups/${groupId}/translations`)
      .send({
        locale: 'fr',
        slug: `${originalSlug}-fr`,
        seoMeta: { title: 'Plombier', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${frTranslationRes.body.id}/publish`)
      .expect(201);

    const duplicateRes = await agent
      .post(`/page-groups/${groupId}/duplicate`)
      .expect(201);
    expect(duplicateRes.body.id).not.toBe(groupId);
    expect(duplicateRes.body.content).toEqual([
      { id: 'block-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);

    const duplicateTranslationsRes = await agent
      .get(`/page-groups/${duplicateRes.body.id}/translations`)
      .expect(200);
    const bySlug = new Map(
      duplicateTranslationsRes.body.map(
        (t: {
          slug: string;
          locale: string;
          status: string;
          seoMeta: { title: string };
        }) => [t.locale, t],
      ),
    );
    expect(bySlug.get('it')).toMatchObject({
      slug: `${originalSlug}-copy`,
      status: 'draft',
      seoMeta: { title: 'Idraulico' },
    });
    expect(bySlug.get('fr')).toMatchObject({
      slug: `${originalSlug}-fr-copy`,
      // The source's fr translation was published — the duplicate must
      // still start as an unpublished draft.
      status: 'draft',
      seoMeta: { title: 'Plombier' },
    });
  });

  /*
   * The editor's New page: the page and its first language in one request.
   * Refused for its address, it must leave nothing behind — it used to
   * leave a page with no language, which crashed the editor that opened it.
   */
  it('creates a page with its first language in one request, and nothing when the address is taken', async () => {
    const slug = `about-${randomUUID()}`;
    const translation = {
      locale: 'en',
      slug,
      seoMeta: { title: 'About', description: '' },
    };
    const created = await agent
      .post('/page-groups')
      .send({ siteId, translation })
      .expect(201);
    const translations = await agent
      .get(`/page-groups/${created.body.id}/translations`)
      .expect(200);
    expect(translations.body).toHaveLength(1);
    const before = await agent
      .get('/page-groups')
      .query({ siteId, pageSize: 100 })
      .expect(200);

    await agent
      .post('/page-groups')
      .send({
        siteId,
        translation: {
          ...translation,
          seoMeta: { title: 'Again', description: '' },
        },
      })
      .expect(409);

    const after = await agent
      .get('/page-groups')
      .query({ siteId, pageSize: 100 })
      .expect(200);
    expect(after.body.total).toBe(before.body.total);
  });

  it('keeps a duplicated article in its collection, over the real HTTP endpoint', async () => {
    const [news] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(collections)
        .values({ tenantId, siteId, name: `News ${randomUUID()}` })
        .returning({ id: collections.id }),
    );
    const articleRes = await agent
      .post('/page-groups')
      .send({ siteId, collectionId: news.id })
      .expect(201);

    const duplicateRes = await agent
      .post(`/page-groups/${articleRes.body.id}/duplicate`)
      .expect(201);

    expect(duplicateRes.body.collectionId).toBe(news.id);
  });

  it('saves a page as a template and starts a new page from it, over the real HTTP endpoint', async () => {
    const pageRes = await agent
      .post('/page-groups')
      .send({
        siteId,
        content: [
          { id: 'hero-1', type: 'Hero', props: { title: 'Plumber' } },
          {
            id: 'newsletter-1',
            type: 'Section',
            props: {
              section: {
                sectionId: randomUUID(),
                sectionName: 'Newsletter',
              },
            },
          },
        ],
      })
      .expect(201);
    const pageId = pageRes.body.id;
    await agent
      .post(`/page-groups/${pageId}/translations`)
      .send({
        locale: 'en',
        slug: `plumber-${randomUUID()}`,
        seoMeta: { title: 'Plumber', description: '' },
      })
      .expect(201);
    const itRes = await agent
      .post(`/page-groups/${pageId}/translations`)
      .send({
        locale: 'it',
        slug: `idraulico-${randomUUID()}`,
        seoMeta: { title: 'Idraulico', description: '' },
      })
      .expect(201);
    await agent
      .patch(`/page-groups/translations/${itRes.body.id}/field-values`)
      .send({
        fieldValues: { 'hero-1': { title: 'Idraulico' } },
        parentGroupId: null,
      })
      .expect(200);

    const templateName = `Service page ${randomUUID()}`;
    const templateRes = await agent
      .post(`/page-groups/${pageId}/save-as-template`)
      .send({ name: templateName })
      .expect(201);
    // The site's default language is English: the Italian overlay stays
    // behind, and the template is ready to use at once.
    expect(templateRes.body).toMatchObject({
      name: templateName,
      kind: 'template',
      status: 'published',
      siteId,
    });
    expect(templateRes.body.content[0].props).toEqual({ title: 'Plumber' });
    expect(templateRes.body.publishedContent).toEqual(templateRes.body.content);

    await agent
      .post(`/page-groups/${pageId}/save-as-template`)
      .send({ name: templateName })
      .expect(409);

    // Without its first language, a page may not start from a template.
    await agent
      .post('/page-groups')
      .send({ siteId, templateId: templateRes.body.id })
      .expect(400);
    const fromTemplateSlug = `from-template-${randomUUID()}`;
    const fromTemplateRes = await agent
      .post('/page-groups')
      .send({
        siteId,
        templateId: templateRes.body.id,
        translation: {
          locale: 'en',
          slug: fromTemplateSlug,
          seoMeta: { title: 'From a template', description: '' },
        },
      })
      .expect(201);
    const fromTemplateTranslations = await agent
      .get(`/page-groups/${fromTemplateRes.body.id}/translations`)
      .expect(200);
    expect(
      fromTemplateTranslations.body.map((t: { slug: string }) => t.slug),
    ).toEqual([fromTemplateSlug]);
    const content = fromTemplateRes.body.content as {
      id: string;
      type: string;
      props: Record<string, unknown>;
    }[];
    expect(content.map((block) => block.type)).toEqual(['Hero', 'Section']);
    expect(content[0].props).toEqual({ title: 'Plumber' });
    // The newsletter is still a reference to the shared section, not a copy.
    expect(content[1].props).toEqual(pageRes.body.content[1].props);
    for (const block of content) {
      expect(['hero-1', 'newsletter-1']).not.toContain(block.id);
    }
  });

  it('refuses to start a page from anything but a published template of the site, over the real HTTP endpoint', async () => {
    const [shared, draft] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(reusableSections)
        .values([
          {
            tenantId,
            siteId,
            name: `Shared ${randomUUID()}`,
            kind: 'shared',
            status: 'published',
            content: [],
            publishedContent: [],
          },
          {
            tenantId,
            siteId,
            name: `Draft ${randomUUID()}`,
            kind: 'template',
            status: 'draft',
            content: [],
          },
        ])
        .returning({ id: reusableSections.id }),
    );

    const translation = {
      locale: 'en',
      slug: `refused-${randomUUID()}`,
      seoMeta: { title: 'Refused', description: '' },
    };
    const pagesBefore = await agent
      .get('/page-groups')
      .query({ siteId, pageSize: 100 })
      .expect(200);

    // A shared section, a draft and a missing id are one answer to the
    // person starting a page: there is no such template to start from.
    for (const templateId of [shared.id, draft.id, randomUUID()]) {
      await agent
        .post('/page-groups')
        .send({ siteId, templateId, translation })
        .expect(404);
    }
    await agent
      .post('/page-groups')
      .send({ siteId, templateId: draft.id, content: [], translation })
      .expect(400);

    const pagesAfter = await agent
      .get('/page-groups')
      .query({ siteId, pageSize: 100 })
      .expect(200);
    expect(pagesAfter.body.total).toBe(pagesBefore.body.total);
  });

  it('gives a collection a default template, refuses one a page cannot start from, and forgets it when the template goes, over the real HTTP endpoint', async () => {
    const [template, shared] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(reusableSections)
        .values([
          {
            tenantId,
            siteId,
            name: `Article ${randomUUID()}`,
            kind: 'template',
            status: 'published',
            content: [],
            publishedContent: [],
          },
          {
            tenantId,
            siteId,
            name: `Newsletter ${randomUUID()}`,
            kind: 'shared',
            status: 'published',
            content: [],
            publishedContent: [],
          },
        ])
        .returning({ id: reusableSections.id }),
    );
    const collectionRes = await agent
      .post('/collections')
      .send({ siteId, name: 'News' })
      .expect(201);
    expect(collectionRes.body.defaultTemplateId).toBeNull();
    const collectionId = collectionRes.body.id;

    const setRes = await agent
      .patch(`/collections/${collectionId}`)
      .send({ defaultTemplateId: template.id })
      .expect(200);
    expect(setRes.body.defaultTemplateId).toBe(template.id);

    await agent
      .patch(`/collections/${collectionId}`)
      .send({ defaultTemplateId: shared.id })
      .expect(404);
    const listRes = await agent
      .get('/collections')
      .query({ siteId })
      .expect(200);
    const listed = listRes.body.find(
      (one: { id: string }) => one.id === collectionId,
    );
    expect(listed.defaultTemplateId).toBe(template.id);

    // Deleting the template takes the suggestion away, not the collection.
    await agent.delete(`/reusable-sections/${template.id}`).expect(200);
    const afterDeleteRes = await agent
      .get('/collections')
      .query({ siteId })
      .expect(200);
    expect(
      afterDeleteRes.body.find((one: { id: string }) => one.id === collectionId)
        .defaultTemplateId,
    ).toBeNull();

    const clearedRes = await agent
      .patch(`/collections/${collectionId}`)
      .send({ defaultTemplateId: null })
      .expect(200);
    expect(clearedRes.body.defaultTemplateId).toBeNull();
  });

  describe('listing by state', () => {
    async function pageWith(title: string, word: string) {
      const group = await agent
        .post('/page-groups')
        .send({ siteId, content: [] })
        .expect(201);
      const translation = await agent
        .post(`/page-groups/${group.body.id}/translations`)
        .send({
          locale: 'it',
          slug: `${word}-${randomUUID().slice(0, 8)}`,
          seoMeta: { title: `${word} ${title}`, description: '' },
        })
        .expect(201);
      return {
        groupId: group.body.id as string,
        translationId: translation.body.id as string,
      };
    }

    async function idsIn(word: string, status?: string) {
      const res = await agent
        .get('/page-groups')
        .query({ siteId, search: word, ...(status ? { status } : {}) })
        .expect(200);
      return res.body.items.map((item: { id: string }) => item.id).sort();
    }

    it('finds the drafts, the published and the ones online with changes waiting', async () => {
      const word = `stato${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const draft = await pageWith('bozza', word);
      const live = await pageWith('online', word);
      const pending = await pageWith('con modifiche', word);
      await agent
        .post(`/page-groups/translations/${live.translationId}/publish`)
        .expect(201);
      await agent
        .post(`/page-groups/translations/${pending.translationId}/publish`)
        .expect(201);
      // The shared structure changes after it went online.
      await agent
        .patch(`/page-groups/${pending.groupId}/content`)
        .send({
          content: [
            { id: randomUUID(), type: 'Text', props: { body: 'nuovo' } },
          ],
        })
        .expect(200);

      expect(await idsIn(word, 'draft')).toEqual([draft.groupId]);
      expect(await idsIn(word, 'published')).toEqual([live.groupId]);
      expect(await idsIn(word, 'pending')).toEqual([pending.groupId]);
      // No state asked for: all three.
      expect(await idsIn(word)).toEqual(
        [draft.groupId, live.groupId, pending.groupId].sort(),
      );
    });

    it('counts the pages of the state, not the page of the list it was found on', async () => {
      const word = `stato${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      await pageWith('uno', word);
      await pageWith('due', word);
      await pageWith('tre', word);

      const res = await agent
        .get('/page-groups')
        .query({ siteId, search: word, status: 'draft', pageSize: 2 })
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
    });

    it('400s a state that is not one', async () => {
      await agent
        .get('/page-groups')
        .query({ siteId, status: 'sospeso' })
        .expect(400);
    });
  });

  it('lists groups filtered by title search and locale, over the real public HTTP endpoint', async () => {
    const searchSlug = `idraulico-${randomUUID()}`;
    const groupRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: searchSlug,
        seoMeta: { title: 'Idraulico a Roma', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'fr',
        slug: `${searchSlug}-fr`,
        seoMeta: { title: 'Plombier à Rome', description: '' },
      })
      .expect(201);

    const bySearch = await agent
      .get('/page-groups')
      .query({ siteId, search: 'Idraulico' })
      .expect(200);
    const searchIds = bySearch.body.items.map(
      (item: { id: string }) => item.id,
    );
    expect(searchIds).toContain(groupRes.body.id);

    const byWrongSearch = await agent
      .get('/page-groups')
      .query({ siteId, search: 'Elettricista' })
      .expect(200);
    const wrongSearchIds = byWrongSearch.body.items.map(
      (item: { id: string }) => item.id,
    );
    expect(wrongSearchIds).not.toContain(groupRes.body.id);

    const byLocale = await agent
      .get('/page-groups')
      .query({ siteId, locale: 'fr' })
      .expect(200);
    const localeIds = byLocale.body.items.map(
      (item: { id: string }) => item.id,
    );
    expect(localeIds).toContain(groupRes.body.id);

    const row = bySearch.body.items.find(
      (item: { id: string }) => item.id === groupRes.body.id,
    );
    expect(
      row.translations.sort((a: { locale: string }, b: { locale: string }) =>
        a.locale.localeCompare(b.locale),
      ),
    ).toEqual([
      {
        locale: 'fr',
        slug: `${searchSlug}-fr`,
        title: 'Plombier à Rome',
        status: 'draft',
        isDiverged: false,
        hasUnpublishedChanges: false,
      },
      {
        locale: 'it',
        slug: searchSlug,
        title: 'Idraulico a Roma',
        status: 'draft',
        isDiverged: false,
        hasUnpublishedChanges: false,
      },
    ]);
  });

  /*
   * Where a page goes, and in what language, used to be taken as sent: a
   * parent of another site passed the foreign key, an id that named nothing
   * failed inside the insert as a 500, and any string was a language.
   */
  describe('where a new page may go', () => {
    const translation = (slug: string, locale = 'it') => ({
      locale,
      slug,
      seoMeta: { title: slug, description: '' },
    });

    it('404s a parent from another site', async () => {
      const otherSiteId = await integration.createSite();
      const foreign = await agent
        .post('/page-groups')
        .send({ siteId: otherSiteId, translation: translation('altrove') })
        .expect(201);

      await agent
        .post('/page-groups')
        .send({
          siteId,
          parentId: foreign.body.id,
          translation: translation(`figlia-${randomUUID()}`),
        })
        .expect(404);
    });

    it('404s a parent that does not exist, not a server error', async () => {
      await agent
        .post('/page-groups')
        .send({
          siteId,
          parentId: randomUUID(),
          translation: translation(`figlia-${randomUUID()}`),
        })
        .expect(404);
    });

    it('400s a language the site does not offer', async () => {
      await agent
        .post('/page-groups')
        .send({
          siteId,
          translation: translation(`seite-${randomUUID()}`, 'de'),
        })
        .expect(400);
    });
  });
});
