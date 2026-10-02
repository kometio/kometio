import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  type KometioDb,
  media,
  pageGroups,
  pageTranslations,
  withTenant,
} from '@kometio/postgres-db';
import { DashboardModule } from './dashboard.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres — see docs/development.md. Same
 * throwaway-site-under-DEFAULT_TENANT_ID isolation as
 * media.controller.integration.spec.ts.
 */
describe('DashboardController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let db: KometioDb;
  let tenantId: string;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [DashboardModule] });
    app = integration.app;
    ({ db, tenantId } = integration);
    siteId = await integration.createSite();

    // Fixture data the assertions below read back through the endpoint —
    // one published page, one draft, one media file.
    const [group] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId, siteId })
        .returning({ id: pageGroups.id }),
    );
    await withTenant(db, tenantId, (tx) =>
      tx.insert(pageTranslations).values([
        {
          tenantId,
          siteId,
          pageGroupId: group.id,
          locale: 'it',
          slug: `pubblicata-${randomUUID()}`,
          status: 'published',
          seoMeta: { title: 'Pagina pubblicata', description: '' },
        },
      ]),
    );
    const [group2] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId, siteId })
        .returning({ id: pageGroups.id }),
    );
    await withTenant(db, tenantId, (tx) =>
      tx.insert(pageTranslations).values([
        {
          tenantId,
          siteId,
          pageGroupId: group2.id,
          locale: 'it',
          slug: `bozza-${randomUUID()}`,
          status: 'draft',
          seoMeta: { title: 'Pagina in bozza', description: '' },
        },
      ]),
    );
    await withTenant(db, tenantId, (tx) =>
      tx.insert(media).values({
        tenantId,
        siteId,
        filename: 'foto.jpg',
        storageKey: `key-${randomUUID()}`,
        storageProvider: 'local',
        mimeType: 'image/jpeg',
        size: 12345,
      }),
    );

    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  it('returns page/media stats and recent activity for the site', async () => {
    const res = await agent
      .get('/dashboard/stats')
      .query({ siteId })
      .expect(200);

    expect(res.body.pages.publishedCount).toBeGreaterThanOrEqual(1);
    expect(res.body.pages.draftCount).toBeGreaterThanOrEqual(1);
    expect(res.body.media.count).toBeGreaterThanOrEqual(1);
    expect(res.body.media.totalSizeBytes).toBeGreaterThanOrEqual(12345);
    expect(res.body.recentActivity.length).toBeGreaterThan(0);
    expect(res.body.recentActivity[0]).toHaveProperty('title');
    expect(res.body.recentActivity[0]).toHaveProperty('status');
  });

  it('says, for each page of the feed, whether it is online with changes waiting', async () => {
    const [pendingGroup] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({
          tenantId,
          siteId,
          contentUpdatedAt: new Date('2026-06-01T00:00:00Z'),
        })
        .returning({ id: pageGroups.id }),
    );
    const title = `Con modifiche ${randomUUID()}`;
    await withTenant(db, tenantId, (tx) =>
      tx.insert(pageTranslations).values({
        tenantId,
        siteId,
        pageGroupId: pendingGroup.id,
        locale: 'it',
        slug: `modifiche-${randomUUID()}`,
        status: 'published',
        seoMeta: { title, description: '' },
        publishedAt: new Date('2026-04-01T00:00:00Z'),
        contentUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );

    const res = await agent
      .get('/dashboard/stats')
      .query({ siteId })
      .expect(200);

    const byTitle = (name: string) =>
      res.body.recentActivity.find(
        (item: { title: string }) => item.title === name,
      );
    expect(byTitle(title).hasUnpublishedChanges).toBe(true);
    // The pages that were never edited after being written are not flagged.
    expect(byTitle('Pagina pubblicata').hasUnpublishedChanges).toBe(false);
    expect(byTitle('Pagina in bozza').hasUnpublishedChanges).toBe(false);
  });

  it('400s with a missing or invalid siteId', async () => {
    await agent
      .get('/dashboard/stats')
      .query({ siteId: 'not-a-uuid' })
      .expect(400);
  });

  it('401s without a session cookie', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/stats')
      .query({ siteId })
      .expect(401);
  });
});
