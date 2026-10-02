import { describe, expect, it } from 'vitest';
import { MediaNotFoundError, MediaTooLargeError } from '@kometio/domain-core';
import { MAX_UPLOAD_BYTES_BY_KIND, uploadMedia } from './upload-media.use-case';
import { listMedia } from './list-media.use-case';
import { countMediaByKind } from './count-media-by-kind.use-case';
import { deleteMedia } from './delete-media.use-case';
import {
  InMemoryMediaRepository,
  InMemoryMediaStorage,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';

/**
 * A real PNG signature. `uploadMedia` sniffs the bytes to pick the size
 * limit that applies (ADR-0054), so a fixture of `[1, 2, 3]` is no longer
 * a file at all as far as it is concerned — it is refused before the
 * storage port is ever reached.
 */
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBytes = (...extra: number[]): Uint8Array =>
  new Uint8Array([...PNG_HEADER, ...extra]);

describe('media lifecycle: upload -> list -> delete', () => {
  const tenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  function setup() {
    const mediaRepository = new InMemoryMediaRepository();
    const mediaStorage = new InMemoryMediaStorage();
    return {
      mediaRepository,
      mediaStorage,
      // This tenant's two sites, and one of another tenant's.
      siteRepository: new InMemorySiteRepository(
        buildSite(),
        buildSite({ id: 'site-2', domain: 'altro.example' }),
        buildSite({
          id: 'site-other-tenant',
          tenantId: 'tenant-2',
          domain: 'altrui.example',
        }),
      ),
    };
  }

  it('uploads through the storage port and persists the returned metadata', async () => {
    const deps = setup();

    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'foto.png',
      mimeType: 'image/png',
      data: pngBytes(1, 2, 3),
    });

    expect(media.filename).toBe('foto.png');
    expect(media.storageProvider).toBe('local');
    expect(media.mimeType).toBe('image/webp'); // converted, not the input type
    expect(media.width).toBe(800);
    expect(deps.mediaStorage.uploads).toHaveLength(1);
    expect(deps.mediaStorage.uploads[0].filename).toBe('foto.png');

    const found = await deps.mediaRepository.findById(tenantId, media.id);
    expect(found?.storageKey).toBe(media.storageKey);
  });

  it('listMedia paginates and scopes by tenant/site', async () => {
    const deps = setup();
    for (let i = 0; i < 3; i++) {
      await uploadMedia(deps, {
        tenantId,
        siteId: 'site-1',
        filename: `foto-${i}.png`,
        mimeType: 'image/png',
        data: pngBytes(i),
      });
    }
    await uploadMedia(deps, {
      tenantId: otherTenantId,
      siteId: 'site-other-tenant',
      filename: 'non-mio.png',
      mimeType: 'image/png',
      data: pngBytes(9),
    });

    const result = await listMedia(deps, {
      tenantId,
      siteId: 'site-1',
      page: 1,
      pageSize: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('deleteMedia removes the stored file and the DB row', async () => {
    const deps = setup();
    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'foto.png',
      mimeType: 'image/png',
      data: pngBytes(1),
    });

    await deleteMedia(deps, { tenantId, mediaId: media.id });

    expect(deps.mediaStorage.deletedKeys).toEqual([media.storageKey]);
    expect(await deps.mediaRepository.findById(tenantId, media.id)).toBeNull();
  });

  it('deleteMedia throws MediaNotFoundError for a nonexistent id', async () => {
    const deps = setup();

    await expect(
      deleteMedia(deps, { tenantId, mediaId: 'does-not-exist' }),
    ).rejects.toThrow(MediaNotFoundError);
  });

  it('deleteMedia does not touch a different tenant', async () => {
    const deps = setup();
    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'foto.png',
      mimeType: 'image/png',
      data: pngBytes(1),
    });

    await expect(
      deleteMedia(deps, { tenantId: otherTenantId, mediaId: media.id }),
    ).rejects.toThrow(MediaNotFoundError);
    expect(
      await deps.mediaRepository.findById(tenantId, media.id),
    ).not.toBeNull();
  });

  /*
   * The size limit differs by kind (ADR-0054), because one number cannot
   * serve both a photo and a video: 10MB is generous for one and useless
   * for the other. These pin that the limit applied is the one for what
   * the file actually IS, not for what it claims to be.
   */
  it('refuses an image past the image limit', async () => {
    const deps = setup();
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES_BY_KIND.image + 1);
    oversized.set(PNG_HEADER);

    await expect(
      uploadMedia(deps, {
        tenantId,
        siteId: 'site-1',
        filename: 'enorme.png',
        mimeType: 'image/png',
        data: oversized,
      }),
    ).rejects.toThrow(MediaTooLargeError);
  });

  it('allows a video the size of several images, since its limit is its own', async () => {
    const deps = setup();
    // Comfortably past the image limit and inside the video one — the
    // whole point of having two numbers.
    const video = new Uint8Array(MAX_UPLOAD_BYTES_BY_KIND.image + 1024);
    video.set([0x00, 0x00, 0x00, 0x20]);
    video.set(
      [...'ftypisom'].map((c) => c.charCodeAt(0)),
      4,
    );

    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      data: video,
    });

    expect(media.mimeType).toBe('video/mp4');
  });

  /*
   * The library used to refuse this outright. It now takes any file
   * (ADR-0070) — and what has to stay true is the other half of that
   * rule: claiming to be a PNG must never make a file an image. Its bytes
   * are not one, so it is kept as an opaque download under `files/`, never
   * served inline where a browser would run what is inside it.
   */
  it('takes a file whose bytes are not what it claims, but never as the image it pretends to be', async () => {
    const deps = setup();
    const svg = new TextEncoder().encode('<svg><script>alert(1)</script>');

    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'innocuo.png',
      mimeType: 'image/png',
      data: svg,
    });

    // Filed where its name says — an image — and kept where nothing is
    // ever opened in place.
    expect(media.mimeType).toBe('image/png');
    expect(media.storageKey).toMatch(/^files\//);
  });

  it('takes a PDF as a document, stored under its own name for download', async () => {
    const deps = setup();

    const media = await uploadMedia(deps, {
      tenantId,
      siteId: 'site-1',
      filename: 'Listino 2026.pdf',
      mimeType: 'application/pdf',
      data: new TextEncoder().encode('%PDF-1.7'),
    });

    expect(media.mimeType).toBe('application/pdf');
    expect(media.storageKey).toMatch(/^files\/.+\/Listino-2026\.pdf$/);
  });

  it('still refuses a document larger than a document may be', async () => {
    const deps = setup();

    await expect(
      uploadMedia(deps, {
        tenantId,
        siteId: 'site-1',
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        data: new Uint8Array(MAX_UPLOAD_BYTES_BY_KIND.document + 1),
      }),
    ).rejects.toThrow(MediaTooLargeError);
  });

  it("counts a site's files by kind, and nothing from any other site", async () => {
    const deps = setup();
    const upload = (siteId: string, filename: string, data: Uint8Array) =>
      uploadMedia(deps, {
        tenantId,
        siteId,
        filename,
        mimeType: 'application/octet-stream',
        data,
      });
    await upload('site-1', 'foto.png', pngBytes(1, 2, 3));
    await upload('site-1', 'listino.pdf', new TextEncoder().encode('%PDF'));
    await upload('site-1', 'menu.pdf', new TextEncoder().encode('%PDF'));
    await upload('site-1', 'archivio.zip', new TextEncoder().encode('PK'));
    await upload('site-2', 'altro-sito.pdf', new TextEncoder().encode('%PDF'));

    expect(
      await countMediaByKind(deps, { tenantId, siteId: 'site-1' }),
    ).toEqual({ image: 1, video: 0, audio: 0, document: 2, other: 1 });
  });
});
