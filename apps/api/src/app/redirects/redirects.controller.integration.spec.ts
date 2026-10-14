import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { RedirectTrafficBuffer } from '@kometio/application';
import { PagesModule } from '../pages/pages.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { PublicRedirectsModule } from './public-redirects.module';
import { RedirectsModule } from './redirects.module';
import { REDIRECT_TRAFFIC } from './redirects.tokens';

/**
 * Runs against a real Postgres — see docs/development.md. The rules are
 * written the normal, authenticated way and asked the way the public site
 * asks them, with no session: what is verified is that a visitor is sent
 * where the rule says, and that nothing else can be done from there.
 */
describe('Redirects (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  let domain: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [PagesModule, RedirectsModule, PublicRedirectsModule],
    });
    app = integration.app;
    domain = `redirects-${randomUUID()}.example.test`;
    siteId = await integration.createSite({
      name: 'Redirects site',
      domain,
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  const resolve = (path: string, search = '') =>
    request(app.getHttpServer())
      .get('/public/redirects/resolve')
      .query({ domain, path, search });

  const flush = () => app.get<RedirectTrafficBuffer>(REDIRECT_TRAFFIC).flush();

  async function publishedPage(slug: string) {
    const group = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    const translation = await agent
      .post(`/page-groups/${group.body.id}/translations`)
      .send({
        locale: 'it',
        slug,
        seoMeta: { title: `Pagina ${slug}`, description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${translation.body.id}/publish`)
      .expect(201);
    return group.body.id as string;
  }

  it('is for people who can change the live site, and for nobody else', async () => {
    await request(app.getHttpServer())
      .get('/redirects')
      .query({ siteId })
      .expect(401);

    const editor = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );
    await editor
      .post('/redirects')
      .send({ siteId, from: '/old', to: { kind: 'url', url: '/it/new' } })
      .expect(403);
    await editor.get('/redirects').query({ siteId }).expect(403);
  });

  it('creates, lists, changes and deletes a rule, and the visitor follows each change', async () => {
    const created = await agent
      .post('/redirects')
      .send({
        siteId,
        from: 'https://old-site.example/2019/05/Old-Post/',
        to: { kind: 'url', url: '/it/new' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      from: '/2019/05/old-post',
      kind: 'exact',
      status: 301,
      origin: 'manual',
      hits: 0,
      target: { kind: 'url', url: '/it/new' },
    });

    const answer = await resolve('/2019/05/old-post').expect(200);
    expect(answer.body).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/it/new',
    });

    const listed = await agent
      .get('/redirects')
      .query({ siteId, search: 'OLD-POST' })
      .expect(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([
      created.body.id,
    ]);

    await agent
      .patch(`/redirects/${created.body.id}`)
      .send({ to: { kind: 'url', url: '/it/other' }, status: 302 })
      .expect(200);
    expect((await resolve('/2019/05/old-post').expect(200)).body).toEqual({
      outcome: 'redirect',
      status: 302,
      location: '/it/other',
    });

    await agent.delete(`/redirects/${created.body.id}`).expect(204);
    await resolve('/2019/05/old-post').expect(404);
    await agent.delete(`/redirects/${created.body.id}`).expect(404);
  });

  it('stores an address that is a page as that page, and follows the page when it moves', async () => {
    const groupId = await publishedPage('chi-siamo');
    const created = await agent
      .post('/redirects')
      .send({
        siteId,
        from: '/about-us',
        to: { kind: 'url', url: '/it/chi-siamo' },
      })
      .expect(201);

    expect(created.body.target).toMatchObject({
      kind: 'page',
      pageGroupId: groupId,
      locale: 'it',
      title: 'Pagina chi-siamo',
      path: '/it/chi-siamo',
      isPublished: true,
    });
    expect((await resolve('/about-us').expect(200)).body.location).toBe(
      '/it/chi-siamo',
    );
  });

  it('sends the front door with a number where a rule says, keeping the rest of the link', async () => {
    await agent
      .post('/redirects')
      .send({ siteId, from: '/?p=123', to: { kind: 'url', url: '/it/post' } })
      .expect(201);

    const answer = await resolve('/', '?p=123&utm_source=mail').expect(200);

    expect(answer.body.location).toBe('/it/post?utm_source=mail');
  });

  it('answers a pattern, with what it took', async () => {
    await publishedPage('mio-articolo');
    await agent
      .post('/redirects')
      .send({
        siteId,
        from: '/:year/:month/:slug',
        to: { kind: 'url', url: '/it/:slug' },
      })
      .expect(201);

    const answer = await resolve('/2019/05/mio-articolo').expect(200);

    expect(answer.body.location).toBe('/it/mio-articolo');
  });

  it('says an address is gone', async () => {
    await agent
      .post('/redirects')
      .send({ siteId, from: '/removed', to: null, status: 410 })
      .expect(201);

    const answer = await resolve('/removed').expect(200);

    expect(answer.body).toEqual({ outcome: 'gone' });
  });

  it('refuses what cannot work, with the reason as its message', async () => {
    const bad = await agent
      .post('/redirects')
      .send({ siteId, from: '/api/forms', to: { kind: 'url', url: '/x' } })
      .expect(400);
    expect(bad.body.message).toBe('redirect:source:reserved:api');

    await agent
      .post('/redirects')
      .send({ siteId, from: '/same', to: { kind: 'url', url: '/same' } })
      .expect(400);

    await agent
      .post('/redirects')
      .send({ siteId, from: '/dup', to: { kind: 'url', url: '/a' } })
      .expect(201);
    await agent
      .post('/redirects')
      .send({ siteId, from: '/DUP/', to: { kind: 'url', url: '/b' } })
      .expect(409);

    await agent
      .post('/redirects')
      .send({ siteId, from: '/loop-a', to: { kind: 'url', url: '/loop-b' } })
      .expect(201);
    const loop = await agent
      .post('/redirects')
      .send({ siteId, from: '/loop-b', to: { kind: 'url', url: '/loop-a' } })
      .expect(400);
    expect(loop.body.message).toBe('redirect:target:loop');
  });

  it('counts what was asked for, and what was not found, in batches', async () => {
    const created = await agent
      .post('/redirects')
      .send({ siteId, from: '/counted', to: { kind: 'url', url: '/it/x' } })
      .expect(201);
    await resolve('/counted').expect(200);
    await resolve('/counted').expect(200);
    await resolve('/never-existed').expect(404);
    await resolve('/never-existed').expect(404);
    await resolve('/wp-login.php').expect(404);

    await flush();

    const listed = await agent
      .get('/redirects')
      .query({ siteId, search: '/counted' })
      .expect(200);
    const rule = listed.body.items.find(
      (item: { id: string }) => item.id === created.body.id,
    );
    expect(rule.hits).toBe(2);
    expect(rule.lastHitAt).not.toBeNull();

    const missing = await agent
      .get('/redirects/missing')
      .query({ siteId })
      .expect(200);
    const found = missing.body.items.find(
      (item: { path: string }) => item.path === '/never-existed',
    );
    expect(found.hits).toBe(2);
    // A probe is noise, not a thing to fix.
    expect(
      missing.body.items.map((item: { path: string }) => item.path),
    ).not.toContain('/wp-login.php');

    // Dismissed, it is gone from the list.
    await agent.post(`/redirects/missing/${found.id}/dismiss`).expect(204);
    const after = await agent
      .get('/redirects/missing')
      .query({ siteId })
      .expect(200);
    expect(
      after.body.items.map((item: { path: string }) => item.path),
    ).not.toContain('/never-existed');
  });

  it('turns an address that was not found into a rule, and it leaves the list', async () => {
    await resolve('/lost-page').expect(404);
    await flush();
    const before = await agent
      .get('/redirects/missing')
      .query({ siteId })
      .expect(200);
    expect(
      before.body.items.map((item: { path: string }) => item.path),
    ).toContain('/lost-page');

    await agent
      .post('/redirects')
      .send({ siteId, from: '/lost-page', to: { kind: 'url', url: '/it/x' } })
      .expect(201);

    const after = await agent
      .get('/redirects/missing')
      .query({ siteId })
      .expect(200);
    expect(
      after.body.items.map((item: { path: string }) => item.path),
    ).not.toContain('/lost-page');
  });

  it('imports a list, says what it would do first, and is the same site when it is imported again', async () => {
    const csv = 'from,to\n/csv-a,/it/a\n/csv-b,/it/b\n/api/x,/it/c\n';

    const dry = await agent
      .post('/redirects/import')
      .send({ siteId, csv, dryRun: true })
      .expect(201);
    expect(dry.body).toMatchObject({
      created: 2,
      failed: 1,
      applied: false,
    });
    await resolve('/csv-a').expect(404);

    const real = await agent
      .post('/redirects/import')
      .send({ siteId, csv })
      .expect(201);
    expect(real.body).toMatchObject({ created: 2, failed: 1, applied: true });
    expect((await resolve('/csv-a').expect(200)).body.location).toBe('/it/a');

    const again = await agent
      .post('/redirects/import')
      .send({ siteId, csv })
      .expect(201);
    expect(again.body).toMatchObject({ created: 0, unchanged: 2, failed: 1 });
  });

  it('tests an address with the rules the site answers by', async () => {
    await agent
      .post('/redirects')
      .send({ siteId, from: '/tested', to: { kind: 'url', url: '/it/there' } })
      .expect(201);

    const found = await agent
      .post('/redirects/test')
      .send({ siteId, address: 'https://old.example/tested?utm=1' })
      .expect(200);
    expect(found.body).toMatchObject({
      outcome: 'redirect',
      status: 301,
      location: '/it/there?utm=1',
    });

    const none = await agent
      .post('/redirects/test')
      .send({ siteId, address: '/it/nothing-here' })
      .expect(200);
    expect(none.body).toEqual({ outcome: 'none' });
  });

  it('does not answer for a site it does not know', async () => {
    await request(app.getHttpServer())
      .get('/public/redirects/resolve')
      .query({ domain: 'someone-else.example.test', path: '/tested' })
      .expect(404);
  });
});
