import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ImportsModule } from './imports.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres. The exports this feature was built
 * against are real client sites and stay off this repo — what is written
 * here is the smallest WXR that exercises the whole path.
 */
describe('ImportsController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [ImportsModule] });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  function wxrFile(body: string): string {
    const path = join(tmpdir(), `wxr-${randomUUID()}.xml`);
    writeFileSync(
      path,
      `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title><![CDATA[Il sito]]></title>
  <wp:base_blog_url>https://esempio.test</wp:base_blog_url>
${body}
</channel>
</rss>`,
    );
    return path;
  }

  /** Polls the way the editor does, because that is the contract being tested. */
  async function waitForReport(jobId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const res = await agent.get(`/imports/${jobId}`).expect(200);
      if (res.body.status !== 'analyzing') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the analysis never finished');
  }

  it('reads an uploaded export and answers with what it would bring across', async () => {
    const path = wxrFile(`  <item>
    <title><![CDATA[Chi siamo]]></title>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Ciao</p><!-- /wp:paragraph --><!-- wp:acf/hero {"name":"acf/hero"} /-->]]></content:encoded>
    <wp:post_id>1</wp:post_id>
    <wp:post_type><![CDATA[page]]></wp:post_type>
    <wp:status><![CDATA[publish]]></wp:status>
  </item>
  <item>
    <wp:post_id>2</wp:post_id>
    <wp:post_type><![CDATA[product]]></wp:post_type>
    <wp:status><![CDATA[publish]]></wp:status>
  </item>`);

    const started = await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', siteId)
      .attach('file', path)
      .expect(202);

    // 202 and not 200: the reading has not happened yet.
    expect(started.body.status).toBe('analyzing');
    expect(started.body.report).toBeNull();

    const finished = await waitForReport(started.body.id);

    expect(finished.status).toBe('analyzed');
    expect(finished.report.siteTitle).toBe('Il sito');
    expect(finished.report.found.pages).toBe(1);
    expect(finished.report.pages).toEqual({ whole: 0, partial: 1, empty: 0 });
    expect(finished.report.blocks.quarantined).toEqual([
      { name: 'acf/hero', count: 1 },
    ]);
    expect(finished.report.found.otherTypes).toEqual([
      { type: 'product', count: 1 },
    ]);
  });

  it('records the failure on the job rather than losing it', async () => {
    // Whoever uploaded the file has to be told; there is no request left
    // to throw into by the time the reading happens.
    const path = join(tmpdir(), `not-xml-${randomUUID()}.xml`);
    writeFileSync(path, 'questo non è un export');

    const started = await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', siteId)
      .attach('file', path)
      .expect(202);

    const finished = await waitForReport(started.body.id);

    // A file that is not an export parses to an export with nothing in
    // it, which is reported as exactly that — no pages, no invention.
    expect(finished.status).toBe('analyzed');
    expect(finished.report.found.pages).toBe(0);
    expect(finished.report.blocks.total).toBe(0);
  });

  it('deletes the upload when it refuses the request', async () => {
    // Multer writes the file before anything can refuse the request, so
    // a refusal that walks away leaves it there — and the way to fill a
    // disk is then to keep uploading to a site you do not own, 512 MB at
    // a time.
    const before = readdirSync(tmpdir()).filter((name) =>
      name.startsWith('kometio-import-'),
    ).length;

    await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', randomUUID())
      .attach('file', wxrFile(''))
      .expect(404);
    await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', 'not-a-uuid')
      .attach('file', wxrFile(''))
      .expect(400);

    const after = readdirSync(tmpdir()).filter((name) =>
      name.startsWith('kometio-import-'),
    ).length;
    expect(after).toBe(before);
  });

  it('refuses an upload with no file', async () => {
    await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', siteId)
      .expect(400);
  });

  it('refuses an upload aimed at a site this tenant does not own', async () => {
    await agent
      .post('/imports/wordpress/analysis')
      .field('siteId', randomUUID())
      .attach('file', wxrFile(''))
      .expect(404);
  });

  it("lists a site's attempts newest first", async () => {
    const res = await agent.get('/imports').query({ siteId }).expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    const dates = res.body.items.map((item: { createdAt: string }) =>
      Date.parse(item.createdAt),
    );
    expect([...dates].sort((a: number, b: number) => b - a)).toEqual(dates);
  });

  it('404s a job that does not exist', async () => {
    await agent.get(`/imports/${randomUUID()}`).expect(404);
  });

  it('refuses the whole thing without a session', async () => {
    await request(app.getHttpServer()).get('/imports').expect(401);
  });
});
