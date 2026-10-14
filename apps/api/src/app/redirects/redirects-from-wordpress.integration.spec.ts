import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { ImportsModule } from '../imports/imports.module';
import { PagesModule } from '../pages/pages.module';
import { PublicRedirectsModule } from './public-redirects.module';
import { RedirectsModule } from './redirects.module';
import { idOf } from '../../test/response-body.test-fixture';

/**
 * Runs against a real Postgres — see docs/development.md. The whole way of a
 * move, as the editor takes it: a WordPress export is uploaded and read, the
 * pages it had are made on the site, the redirects are judged and then made,
 * and a visitor is sent where the page now is. Only the smallest WXR that
 * exercises it is written here; real exports stay off the repository.
 */
describe('Redirects from a WordPress export (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  let domain: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [
        PagesModule,
        ImportsModule,
        RedirectsModule,
        PublicRedirectsModule,
      ],
    });
    app = integration.app;
    domain = `wp-redirects-${randomUUID()}.example.test`;
    siteId = await integration.createSite({
      name: 'WordPress move',
      domain,
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
    });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  const item = (
    id: number,
    type: 'post' | 'page',
    slug: string,
    link: string,
    status = 'publish',
  ) => `  <item>
    <title><![CDATA[${slug}]]></title>
    <link>${link}</link>
    <content:encoded><![CDATA[<p>${slug}</p>]]></content:encoded>
    <wp:post_id>${id}</wp:post_id>
    <wp:post_name><![CDATA[${slug}]]></wp:post_name>
    <wp:post_type><![CDATA[${type}]]></wp:post_type>
    <wp:status><![CDATA[${status}]]></wp:status>
  </item>`;

  async function analysedExport(items: string[]): Promise<string> {
    const path = join(tmpdir(), `wxr-${randomUUID()}.xml`);
    writeFileSync(
      path,
      `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title><![CDATA[Il vecchio sito]]></title>
  <wp:base_blog_url>https://old.example</wp:base_blog_url>
${items.join('\n')}
</channel>
</rss>`,
    );
    const started = await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', siteId)
      .attach('file', path)
      .expect(202);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const res = await agent.get(`/imports/${started.body.id}`).expect(200);
      if (res.body.status === 'analyzed') return idOf(started.body);
      if (res.body.status === 'failed') throw new Error(res.body.failureReason);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the analysis never finished');
  }

  async function publishedPage(slug: string, parentId?: string) {
    const group = await agent
      .post('/page-groups')
      .send({ siteId, content: [], ...(parentId ? { parentId } : {}) })
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
    return idOf(group.body);
  }

  const resolve = (path: string, search = '') =>
    request(app.getHttpServer())
      .get('/public/redirects/resolve')
      .query({ domain, path, search });

  it('judges the move, makes its rules, and a visitor of the old address lands on the page', async () => {
    const blog = await publishedPage('blog');
    await publishedPage('hello-world', blog);
    await publishedPage('about');
    const job = await analysedExport([
      item(
        42,
        'post',
        'hello-world',
        'https://old.example/2019/05/hello-world/',
      ),
      item(7, 'page', 'about', 'https://old.example/about/'),
      item(
        9,
        'post',
        'not-made-yet',
        'https://old.example/2019/06/not-made-yet/',
      ),
      item(10, 'post', 'a-draft', 'https://old.example/?p=10', 'draft'),
    ]);

    const judged = await agent
      .post('/redirects/wordpress')
      .send({ siteId, importJobId: job, dryRun: true })
      .expect(201);

    expect(judged.body.report).toMatchObject({
      created: 4,
      failed: 0,
      applied: false,
    });
    expect(judged.body.pages).toEqual({
      matched: 2,
      ambiguous: 0,
      unmatched: 1,
    });
    expect(judged.body.unmatched).toEqual([
      expect.objectContaining({ id: 9, slug: 'not-made-yet', type: 'post' }),
    ]);
    // Nothing was written by asking.
    expect(
      (await agent.get('/redirects').query({ siteId }).expect(200)).body.total,
    ).toBe(0);

    const made = await agent
      .post('/redirects/wordpress')
      .send({ siteId, importJobId: job, dryRun: false })
      .expect(201);
    expect(made.body.report).toMatchObject({ created: 4, applied: true });

    const listed = await agent
      .get('/redirects')
      .query({ siteId, origin: 'wordpress' })
      .expect(200);
    expect(listed.body.total).toBe(4);
    expect(
      listed.body.items.map((rule: { from: string }) => rule.from).sort(),
    ).toEqual(
      ['/2019/05/hello-world', '/?p=42', '/?page_id=7', '/about'].sort(),
    );
    expect(
      listed.body.items.every(
        (rule: { target: { kind: string } }) => rule.target.kind === 'page',
      ),
    ).toBe(true);

    expect((await resolve('/2019/05/hello-world')).body).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/it/blog/hello-world',
    });
    expect((await resolve('/', 'p=42')).body).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/it/blog/hello-world',
    });
    expect((await resolve('/', 'page_id=7')).body).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/it/about',
    });

    // Making the page and asking again finishes the move: what was made is
    // left as it was, and only what was missing is added.
    await publishedPage('not-made-yet', blog);
    const finished = await agent
      .post('/redirects/wordpress')
      .send({ siteId, importJobId: job, dryRun: false })
      .expect(201);
    expect(finished.body.report).toMatchObject({
      created: 2,
      unchanged: 4,
    });
    expect(finished.body.pages.unmatched).toBe(0);
  });

  it('does not know a file that is not there, and says it of another site’s', async () => {
    await agent
      .post('/redirects/wordpress')
      .send({ siteId, importJobId: randomUUID(), dryRun: true })
      .expect(404);

    const otherSite = await integration.createSite({
      name: 'Another site',
      domain: `other-${randomUUID()}.example.test`,
    });
    const job = await analysedExport([
      item(1, 'page', 'x', 'https://old.example/x/'),
    ]);
    await agent
      .post('/redirects/wordpress')
      .send({ siteId: otherSite, importJobId: job, dryRun: true })
      .expect(404);
  });

  // The file is the importer's, which a publisher can neither list nor
  // upload: making rules from it is the administrator's, like the import.
  it.each(['editor', 'publisher'] as const)(
    'is the administrator’s: a %s is refused',
    async (role) => {
      const person = await integration.login(
        await integration.createUser({ role }),
      );

      await person
        .post('/redirects/wordpress')
        .send({ siteId, importJobId: randomUUID(), dryRun: true })
        .expect(403);
    },
  );
});
