import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationSite,
  createIntegrationTenant,
} from './integration-test-fixtures';
import { normalizeStoredRichText } from './normalize-stored-rich-text';
import {
  pageGroups,
  pageTranslations,
  reusableSections,
  siteLayoutSections,
} from './schema';

/** Runs against a real Postgres — see docs/development.md. */
describe('normalizeStoredRichText (integration)', () => {
  let db: KometioDb;
  let tenantId: string;
  let siteId: string;

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db);
    siteId = await createIntegrationSite(db, tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId]);
    await db.$client.end();
  });

  const callout = (message: string) => [
    { id: 'c1', type: 'Callout', props: { message, tone: 'info' } },
  ];
  const run = () =>
    withTenant(db, tenantId, (tx) => normalizeStoredRichText(tx, tenantId));

  it('reaches a reusable section, which is rendered inside other pages: draft and published', async () => {
    const [section] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(reusableSections)
        .values({
          tenantId,
          siteId,
          name: `Section ${Date.now()}`,
          kind: 'shared',
          status: 'published',
          content: callout('Tom & Jerry'),
          publishedContent: callout('Tom & Jerry'),
        })
        .returning({ id: reusableSections.id }),
    );

    await run();

    const [stored] = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(reusableSections)
        .where(eq(reusableSections.id, section.id)),
    );
    expect(stored.content[0].props['message']).toBe('<p>Tom &amp; Jerry</p>');
    expect(stored.publishedContent?.[0].props['message']).toBe(
      '<p>Tom &amp; Jerry</p>',
    );
  });

  it('reaches the header and footer, and the overlay of a translation', async () => {
    const [layout] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(siteLayoutSections)
        .values({
          tenantId,
          siteId,
          kind: 'footer',
          locale: 'it',
          status: 'draft',
          content: callout('Chi siamo & dove'),
        })
        .returning({ id: siteLayoutSections.id }),
    );
    const [group] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId, siteId, content: callout('Base') })
        .returning({ id: pageGroups.id }),
    );
    const [translation] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageTranslations)
        .values({
          tenantId,
          siteId,
          pageGroupId: group.id,
          locale: 'en',
          status: 'draft',
          slug: `page-${Date.now()}`,
          seoMeta: { title: 'Page', description: '' },
          fieldValues: { c1: { message: 'Fish & chips' } },
        })
        .returning({ id: pageTranslations.id }),
    );

    await run();

    const [footer] = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(siteLayoutSections)
        .where(eq(siteLayoutSections.id, layout.id)),
    );
    expect(footer.content[0].props['message']).toBe(
      '<p>Chi siamo &amp; dove</p>',
    );
    const [stored] = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(pageTranslations)
        .where(eq(pageTranslations.id, translation.id)),
    );
    expect(stored.fieldValues).toEqual({
      c1: { message: '<p>Fish &amp; chips</p>' },
    });
  });

  it('is safe to run again: what is in shape is not written', async () => {
    await run();

    const second = await run();

    expect(second.rewritten).toBe(0);
    expect(second.untouched).toBeGreaterThan(0);
  });
});
