import { beforeEach, describe, expect, it } from 'vitest';
import { classifyUpload, UnreadableImageError } from '@kometio/domain-core';
import { InMemoryImageOptimizer, InMemoryMediaStorage } from '@kometio/testing';
import { storeUpload } from './store-upload';

/*
 * What this application keeps, and under what name and type, whichever store
 * it is kept in. This used to be written twice, once in each storage
 * adapter, and tested twice; it is the application's rule (ADR-0113), and
 * the stores' specs say only that they write what they are given.
 */

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);
// An ISO base media `ftyp` box with a brand the sniffer reads as an MP4.
const MP4 = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
]);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('storeUpload', () => {
  let mediaStorage: InMemoryMediaStorage;
  let imageOptimizer: InMemoryImageOptimizer;

  beforeEach(() => {
    mediaStorage = new InMemoryMediaStorage();
    imageOptimizer = new InMemoryImageOptimizer();
  });

  const store = (filename: string, data: Uint8Array) =>
    storeUpload(
      { mediaStorage, imageOptimizer },
      { filename, data },
      classifyUpload(data, filename),
    );

  it('re-encodes a picture, and keeps it under a key of its own and not under its name', async () => {
    const stored = await store('foto.png', PNG);

    expect(stored.storageKey).toMatch(new RegExp(`^${UUID}\\.webp$`));
    expect(stored.mimeType).toBe('image/webp');
    expect([stored.width, stored.height]).toEqual([800, 600]);
    expect(mediaStorage.puts).toHaveLength(1);
    expect(mediaStorage.puts[0]).toMatchObject({
      key: stored.storageKey,
      contentType: 'image/webp',
    });
    expect(mediaStorage.puts[0]?.downloadName).toBeUndefined();
  });

  it('is told by the bytes what a file is, not by its name', async () => {
    const stored = await store('pagina.html', PNG);

    expect(stored.mimeType).toBe('image/webp');
    expect(stored.storageKey).toMatch(/\.webp$/);
  });

  it('keeps nothing of a picture that cannot be read', async () => {
    imageOptimizer.failWith = new UnreadableImageError();

    await expect(store('rotta.png', PNG)).rejects.toBeInstanceOf(
      UnreadableImageError,
    );

    expect(mediaStorage.puts).toEqual([]);
  });

  it('keeps a file its bytes do not vouch for as a download, in its own directory, under its own name', async () => {
    const data = new Uint8Array([1, 2, 3]);

    const stored = await store('Listino 2026.pdf', data);

    expect(stored.storageKey).toMatch(
      new RegExp(`^files/${UUID}/Listino-2026\\.pdf$`),
    );
    expect(stored.mimeType).toBe('application/pdf');
    expect(stored.size).toBe(3);
    expect([stored.width, stored.height]).toEqual([0, 0]);
    expect(mediaStorage.puts[0]).toMatchObject({
      key: stored.storageKey,
      contentType: 'application/pdf',
      downloadName: 'Listino-2026.pdf',
      data,
    });
  });

  it('never lets a page of markup be opened: it is a download too', async () => {
    const html = new TextEncoder().encode('<script>alert(1)</script>');

    const stored = await store('pagina.html', html);

    expect(stored.storageKey).toMatch(/^files\//);
    expect(mediaStorage.puts[0]?.downloadName).toBe('pagina.html');
  });

  it('keeps a name that tries to leave its directory inside it', async () => {
    const stored = await store('../../etc/passwd.txt', new Uint8Array([1]));

    expect(stored.storageKey).toMatch(new RegExp(`^files/${UUID}/[^/]+$`));
    expect(stored.storageKey).not.toContain('..');
  });

  it('keeps a video as it was uploaded, under the type its bytes have', async () => {
    const stored = await store('clip.mp4', MP4);

    expect(stored.storageKey).toMatch(new RegExp(`^${UUID}\\.mp4$`));
    expect(stored.mimeType).toBe('video/mp4');
    expect(stored.size).toBe(MP4.byteLength);
    expect([stored.width, stored.height]).toEqual([0, 0]);
    expect(mediaStorage.puts[0]?.data).toBe(MP4);
  });
});
