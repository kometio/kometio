import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  createAppDb,
  pageGroups,
  pageTranslations,
  reusableSections,
  siteLayoutSections,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleMediaUsageRepository } from './drizzle-media-usage.repository';

/** A block holding a picked file, as `pickedMediaSchema` stores it. */
const blockWith = (mediaId: string) => [
  {
    id: randomUUID(),
    type: 'image',
    props: {
      media: { mediaId, url: `http://localhost/uploads/${mediaId}.webp` },
      alt: '',
    },
  },
];

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, so this is also the RLS regression test for the reads it
 * makes across pages, sections and the header and footer.
 */
describe('DrizzleMediaUsageRepository (integration)', () => {
  let db: KometioDb;
  let usage: DrizzleMediaUsageRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;
  let siteA2Id: string;
  let siteBId: string;

  beforeAll(async () => {
    db = createAppDb();
    usage = new DrizzleMediaUsageRepository(db);
    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');
    siteAId = await createIntegrationSite(db, tenantAId);
    siteA2Id = await createIntegrationSite(db, tenantAId);
    siteBId = await createIntegrationSite(db, tenantBId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  async function page(
    tenantId: string,
    siteId: string,
    fields: {
      shared?: unknown;
      published?: unknown;
      diverged?: unknown;
      locale?: string;
      slug?: string;
      title?: string;
    },
  ): Promise<string> {
    const groupId = randomUUID();
    await withTenant(db, tenantId, async (tx) => {
      await tx.insert(pageGroups).values({
        id: groupId,
        tenantId,
        siteId,
        content: (fields.shared ?? []) as never,
      });
      await tx.insert(pageTranslations).values({
        tenantId,
        siteId,
        pageGroupId: groupId,
        locale: fields.locale ?? 'it',
        slug: fields.slug ?? `pagina-${randomUUID().slice(0, 8)}`,
        seoMeta: { title: fields.title ?? '', description: '' },
        status: fields.published ? 'published' : 'draft',
        publishedSnapshot: (fields.published ?? null) as never,
        divergedContent: (fields.diverged ?? null) as never,
      });
    });
    return groupId;
  }

  it('finds a page whose shared content holds the file, and names it', async () => {
    const mediaId = randomUUID();
    const groupId = await page(tenantAId, siteAId, {
      shared: blockWith(mediaId),
      slug: 'chi-siamo',
      title: 'Chi siamo',
    });

    const found = await usage.findUsages(tenantAId, siteAId, mediaId);

    expect(found.pages).toEqual([
      {
        pageGroupId: groupId,
        locale: 'it',
        slug: 'chi-siamo',
        title: 'Chi siamo',
      },
    ]);
    expect(found.sections).toEqual([]);
    expect(found.layout).toEqual([]);
  });

  it('finds a page that has it only in what is live, or only in its own unlinked content', async () => {
    const mediaId = randomUUID();
    const live = await page(tenantAId, siteAId, {
      published: blockWith(mediaId),
    });
    const unlinked = await page(tenantAId, siteAId, {
      diverged: blockWith(mediaId),
      locale: 'en',
    });

    const found = await usage.findUsages(tenantAId, siteAId, mediaId);

    expect(found.pages.map((p) => p.pageGroupId).sort()).toEqual(
      [live, unlinked].sort(),
    );
  });

  it('does not find a page that holds another file, or a file whose id merely appears elsewhere in the text', async () => {
    const mediaId = randomUUID();
    await page(tenantAId, siteAId, { shared: blockWith(randomUUID()) });
    // The id in a caption is not a use of the file.
    await page(tenantAId, siteAId, {
      shared: [
        { id: randomUUID(), type: 'text', props: { body: `see ${mediaId}` } },
      ],
    });

    const found = await usage.findUsages(tenantAId, siteAId, mediaId);

    expect(found.pages).toEqual([]);
  });

  it('finds a shared section and the header and footer that hold it, drafts and live', async () => {
    const mediaId = randomUUID();
    const sectionId = randomUUID();
    await withTenant(db, tenantAId, async (tx) => {
      await tx.insert(reusableSections).values({
        id: sectionId,
        tenantId: tenantAId,
        siteId: siteAId,
        name: `Sezione ${randomUUID().slice(0, 6)}`,
        kind: 'shared',
        status: 'published',
        content: [] as never,
        publishedContent: blockWith(mediaId) as never,
      });
      await tx.insert(siteLayoutSections).values([
        {
          tenantId: tenantAId,
          siteId: siteAId,
          locale: 'it',
          kind: 'header',
          status: 'draft',
          content: blockWith(mediaId) as never,
        },
        {
          tenantId: tenantAId,
          siteId: siteAId,
          locale: 'it',
          kind: 'footer',
          status: 'draft',
          content: [] as never,
        },
      ]);
    });

    const found = await usage.findUsages(tenantAId, siteAId, mediaId);

    expect(found.sections.map((s) => s.sectionId)).toEqual([sectionId]);
    expect(found.layout).toEqual([{ kind: 'header', locale: 'it' }]);
  });

  it('is scoped to the site, and to the tenant', async () => {
    const mediaId = randomUUID();
    await page(tenantAId, siteAId, { shared: blockWith(mediaId) });
    await page(tenantBId, siteBId, { shared: blockWith(mediaId) });

    expect(
      (await usage.findUsages(tenantAId, siteA2Id, mediaId)).pages,
    ).toEqual([]);
    // Tenant B's row is behind row-level security: A never sees it, and A
    // asking with B's site id finds nothing either.
    expect((await usage.findUsages(tenantAId, siteBId, mediaId)).pages).toEqual(
      [],
    );
    expect(
      (await usage.findUsages(tenantAId, siteAId, mediaId)).pages,
    ).toHaveLength(1);
  });

  it('answers nothing for an id that cannot be a file, instead of putting it in a pattern', async () => {
    expect(await usage.findUsages(tenantAId, siteAId, '.*')).toEqual({
      pages: [],
      sections: [],
      layout: [],
    });
    expect(await usage.findUsages(tenantAId, siteAId, 'x"|"y')).toEqual({
      pages: [],
      sections: [],
      layout: [],
    });
  });
});
