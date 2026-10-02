import { MEDIA_KINDS, mediaKindOfMime } from '@kometio/shared-types';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Media } from '@kometio/domain-core';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleMediaRepository } from './drizzle-media.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this is also the RLS regression
 * test for `media`.
 */
describe('DrizzleMediaRepository (integration)', () => {
  let db: KometioDb;
  let mediaRepository: DrizzleMediaRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    mediaRepository = new DrizzleMediaRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function buildMedia(
    overrides: Partial<Parameters<typeof Media.create>[0]> = {},
  ) {
    return Media.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      filename: 'foto.jpg',
      storageKey: `${randomUUID()}.webp`,
      storageProvider: 'local',
      mimeType: 'image/webp',
      size: 12345,
      width: 800,
      height: 600,
      ...overrides,
    });
  }

  it('keeps a rename and an alternative text, and reads them back', async () => {
    const item = buildMedia();
    await mediaRepository.add(item);
    expect((await mediaRepository.findById(tenantAId, item.id))?.alt).toBe('');

    item.rename('lago.jpg');
    item.changeAlt('Il lago all’alba');
    await mediaRepository.save(item);

    const found = await mediaRepository.findById(tenantAId, item.id);
    expect([found?.filename, found?.alt]).toEqual([
      'lago.jpg',
      'Il lago all’alba',
    ]);
    // The stored file is the one it always was.
    expect(found?.storageKey).toBe(item.storageKey);
  });

  it('finds a renamed file by its new name', async () => {
    const item = buildMedia({ filename: 'vecchio-nome.jpg' });
    await mediaRepository.add(item);
    item.rename('nome-nuovissimo-zz.jpg');
    await mediaRepository.save(item);

    const found = await mediaRepository.listBySite(
      tenantAId,
      siteAId,
      { page: 1, pageSize: 10 },
      { search: 'nuovissimo-zz' },
    );

    expect(found.items.map((m) => m.id)).toEqual([item.id]);
  });

  it('saves and retrieves media by id, scoped to its tenant', async () => {
    const item = buildMedia();
    await mediaRepository.add(item);

    const found = await mediaRepository.findById(tenantAId, item.id);
    expect(found?.filename).toBe('foto.jpg');
    expect(found?.storageKey).toBe(item.storageKey);

    const foundFromOtherTenant = await mediaRepository.findById(
      tenantBId,
      item.id,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('listBySite paginates, newest first, scoped to tenant and site', async () => {
    const siteForListId = await createIntegrationSite(db, tenantAId);

    const items = [];
    for (let i = 0; i < 3; i++) {
      const item = buildMedia({
        siteId: siteForListId,
        filename: `foto-${i}.jpg`,
      });
      await mediaRepository.add(item);
      items.push(item);
    }

    const firstPage = await mediaRepository.listBySite(
      tenantAId,
      siteForListId,
      {
        page: 1,
        pageSize: 2,
      },
    );
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(3);
    // Newest first: the last one saved comes back first.
    expect(firstPage.items[0].filename).toBe('foto-2.jpg');

    const fromOtherTenant = await mediaRepository.listBySite(
      tenantBId,
      siteForListId,
      { page: 1, pageSize: 10 },
    );
    expect(fromOtherTenant.items).toHaveLength(0);
  });

  /**
   * The library is paginated, so a search has to be answered HERE. Filtering
   * the page that came back would look at the newest twenty-four files and
   * say nothing about the rest, which is worse than no search at all.
   */
  it('listBySite narrows by name and by kind, and stays inside the tenant', async () => {
    const siteForFilterId = await createIntegrationSite(db, tenantAId);

    for (const [filename, mimeType] of [
      ['Report finale.png', 'image/webp'],
      ['report_2026.png', 'image/webp'],
      ['reportX2026.png', 'image/webp'],
      ['intervista.mp4', 'video/mp4'],
      ['jingle.mp3', 'audio/mpeg'],
    ] as const) {
      await mediaRepository.add(
        buildMedia({ siteId: siteForFilterId, filename, mimeType }),
      );
    }

    const page = { page: 1, pageSize: 50 };
    const names = async (
      filter: Parameters<typeof mediaRepository.listBySite>[3],
    ) =>
      (
        await mediaRepository.listBySite(
          tenantAId,
          siteForFilterId,
          page,
          filter,
        )
      ).items
        .map((item) => item.filename)
        .sort();

    // Case-insensitive, and anywhere in the name.
    expect(await names({ search: 'report' })).toEqual([
      'Report finale.png',
      'reportX2026.png',
      'report_2026.png',
    ]);

    // The underscore is a LIKE wildcard. Unescaped, this would also match
    // "reportX2026.png" — a search for one file that quietly returns two.
    expect(await names({ search: 'report_2026' })).toEqual(['report_2026.png']);

    // The kind comes off the stored MIME type's own prefix, which is what
    // the sniffer decided the bytes really were (ADR-0054).
    expect(await names({ kind: 'video' })).toEqual(['intervista.mp4']);
    expect(await names({ kind: 'audio' })).toEqual(['jingle.mp3']);
    expect(await names({ kind: 'image' })).toHaveLength(3);

    // Both at once, and the count reflects the filter rather than the site.
    const narrowed = await mediaRepository.listBySite(
      tenantAId,
      siteForFilterId,
      page,
      { search: 'report', kind: 'image' },
    );
    expect(narrowed.total).toBe(3);

    // A filter is not a way round RLS.
    const fromOtherTenant = await mediaRepository.listBySite(
      tenantBId,
      siteForFilterId,
      page,
      { search: 'report' },
    );
    expect(fromOtherTenant.items).toHaveLength(0);
  });

  /*
   * Five kinds since the library takes any file (ADR-0070). The SQL has to
   * say exactly what `mediaKindOfMime` says — the two are the same rule
   * written twice, once for the database and once for everyone else — so
   * every fixture here is checked against BOTH, rather than against a
   * list of expected names somebody could get wrong the same way twice.
   */
  it('files every stored type under the kind mediaKindOfMime gives it', async () => {
    const siteId = await createIntegrationSite(db, tenantAId);
    const fixtures = [
      ['foto.webp', 'image/webp'],
      ['logo.svg', 'image/svg+xml'],
      ['clip.mp4', 'video/mp4'],
      ['girato.mov', 'video/quicktime'],
      ['jingle.mp3', 'audio/mpeg'],
      ['listino.pdf', 'application/pdf'],
      ['note.txt', 'text/plain'],
      [
        'offerta.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ['archivio.zip', 'application/zip'],
      ['sconosciuto', 'application/octet-stream'],
    ] as const;
    for (const [filename, mimeType] of fixtures) {
      await mediaRepository.add(buildMedia({ siteId, filename, mimeType }));
    }

    for (const kind of MEDIA_KINDS) {
      const result = await mediaRepository.listBySite(
        tenantAId,
        siteId,
        { page: 1, pageSize: 50 },
        { kind },
      );
      const expected = fixtures
        .filter(([, mimeType]) => mediaKindOfMime(mimeType) === kind)
        .map(([filename]) => filename)
        .sort();
      expect({
        kind,
        names: result.items.map((item) => item.filename).sort(),
      }).toEqual({ kind, names: expected });
    }

    // The folder counts come from the same conditions, so each one has to
    // equal the length of the list that folder opens onto.
    const counts = await mediaRepository.countByKind(tenantAId, siteId);
    for (const kind of MEDIA_KINDS) {
      expect({ kind, count: counts[kind] }).toEqual({
        kind,
        count: fixtures.filter(
          ([, mimeType]) => mediaKindOfMime(mimeType) === kind,
        ).length,
      });
    }
  });

  it('save() upserts: a second save updates the same row instead of inserting a new one', async () => {
    const item = buildMedia();
    await mediaRepository.add(item);

    const updated = Media.fromProps({
      ...item.toProps(),
      filename: 'nuovo-nome.jpg',
    });
    await mediaRepository.save(updated);

    const found = await mediaRepository.findById(tenantAId, item.id);
    expect(found?.filename).toBe('nuovo-nome.jpg');
  });

  it('deletes media, scoped to tenant', async () => {
    const item = buildMedia();
    await mediaRepository.add(item);

    await mediaRepository.delete(tenantBId, item.id);
    expect(await mediaRepository.findById(tenantAId, item.id)).not.toBeNull();

    await mediaRepository.delete(tenantAId, item.id);
    expect(await mediaRepository.findById(tenantAId, item.id)).toBeNull();
  });
});
