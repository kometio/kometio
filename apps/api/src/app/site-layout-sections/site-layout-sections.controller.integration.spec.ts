import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SiteLayoutSectionsModule } from './site-layout-sections.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres, through the real HTTP stack — see
 * docs/development.md. Creates its own throwaway site + user under
 * DEFAULT_TENANT_ID in beforeAll, same reasoning as
 * pages.controller.integration.spec.ts (keeps this suite's data out of the
 * site the dev editor-app displays).
 */
describe('SiteLayoutSectionsController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [SiteLayoutSectionsModule],
    });
    app = integration.app;
    siteId = await integration.createSite({ enabledLocales: ['it', 'en'] });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  it('runs the full get-or-create -> draft -> publish -> rollback cycle over HTTP', async () => {
    const locale = `it-${randomUUID()}`;
    const createRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale, kind: 'header' })
      .expect(200);
    expect(createRes.body.status).toBe('draft');
    expect(createRes.body.content).toEqual([]);
    expect(createRes.body.sticky).toBe(false);
    const id = createRes.body.id;

    const reused = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale, kind: 'header' })
      .expect(200);
    expect(reused.body.id).toBe(id);

    const draftRes = await agent
      .patch(`/site-layout-sections/${id}/draft`)
      .send({ content: [{ type: 'Header', props: { v: 1 } }] })
      .expect(200);
    expect(draftRes.body.content).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const publishRes = await agent
      .post(`/site-layout-sections/${id}/publish`)
      .expect(201);
    expect(publishRes.body.status).toBe('published');
    expect(publishRes.body.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const versionsRes = await agent
      .get(`/site-layout-sections/${id}/versions`)
      .expect(200);
    expect(versionsRes.body).toHaveLength(1);
    const firstVersionId = versionsRes.body[0].id;

    await agent
      .patch(`/site-layout-sections/${id}/draft`)
      .send({ content: [{ type: 'Header', props: { v: 2 } }] })
      .expect(200);

    const rollbackRes = await agent
      .post(`/site-layout-sections/${id}/rollback`)
      .send({ versionId: firstVersionId })
      .expect(201);
    expect(rollbackRes.body.content).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);
    // rollback restores the draft only, the published copy is untouched
    expect(rollbackRes.body.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const byId = await agent.get(`/site-layout-sections/${id}`).expect(200);
    expect(byId.body.id).toBe(id);
  });

  it('a new locale starts as a copy of the default locale content', async () => {
    const defaultRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'it', kind: 'footer' })
      .expect(200);
    await agent
      .patch(`/site-layout-sections/${defaultRes.body.id}/draft`)
      .send({ content: [{ type: 'Footer', props: { text: 'Ciao' } }] })
      .expect(200);
    await agent
      .post(`/site-layout-sections/${defaultRes.body.id}/publish`)
      .expect(201);

    const enRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'en', kind: 'footer' })
      .expect(200);

    expect(enRes.body.content).toEqual([
      { type: 'Footer', props: { text: 'Ciao' } },
    ]);
  });

  it('toggles sticky over HTTP, independent of content/draft-publish', async () => {
    const locale = `it-${randomUUID()}`;
    const createRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale, kind: 'header' })
      .expect(200);
    const id = createRes.body.id;

    const stickyRes = await agent
      .patch(`/site-layout-sections/${id}/sticky`)
      .send({ sticky: true })
      .expect(200);
    expect(stickyRes.body.sticky).toBe(true);
    expect(stickyRes.body.status).toBe('draft'); // unaffected

    const byId = await agent.get(`/site-layout-sections/${id}`).expect(200);
    expect(byId.body.sticky).toBe(true);
  });

  it('404s updating sticky for a section that does not exist', async () => {
    await agent
      .patch(`/site-layout-sections/${randomUUID()}/sticky`)
      .send({ sticky: true })
      .expect(404);
  });

  it('400s on a non-boolean sticky value instead of hitting the database', async () => {
    const locale = `it-${randomUUID()}`;
    const createRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale, kind: 'header' })
      .expect(200);

    await agent
      .patch(`/site-layout-sections/${createRes.body.id}/sticky`)
      .send({ sticky: 'yes' })
      .expect(400);
  });

  it('404s on a section that does not exist', async () => {
    await agent.get(`/site-layout-sections/${randomUUID()}`).expect(404);
  });

  it('404s getOrCreate for a site that does not exist', async () => {
    await agent
      .get('/site-layout-sections')
      .query({ siteId: randomUUID(), locale: 'it', kind: 'header' })
      .expect(404);
  });

  it('404s saving a draft for a section that does not exist', async () => {
    await agent
      .patch(`/site-layout-sections/${randomUUID()}/draft`)
      .send({ content: [] })
      .expect(404);
  });

  it('400s on an invalid kind query param instead of hitting the database', async () => {
    await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'it', kind: 'not-a-kind' })
      .expect(400);
  });

  it('401s without a session cookie', async () => {
    await request(app.getHttpServer())
      .get(`/site-layout-sections/${randomUUID()}`)
      .expect(401);
  });
});
