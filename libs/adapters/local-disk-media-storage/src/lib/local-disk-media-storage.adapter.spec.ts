import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskMediaStorageAdapter } from './local-disk-media-storage.adapter';

async function fileExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

/*
 * What a file is, what it is called and what a browser may do with it are
 * the application's to decide (store-upload.spec.ts); this adapter writes
 * what it is given and keeps it inside its directory.
 */
describe('LocalDiskMediaStorageAdapter', () => {
  let uploadDir: string;
  let adapter: LocalDiskMediaStorageAdapter;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'kometio-media-test-'));
    adapter = new LocalDiskMediaStorageAdapter({
      uploadDir,
      publicBaseUrl: 'http://localhost:3000/api',
    });
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('writes the bytes it is given under the key it is given', async () => {
    const key = `${randomUUID()}.webp`;

    await adapter.put({
      key,
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    });

    expect([...(await readFile(join(uploadDir, key)))]).toEqual([1, 2, 3]);
  });

  it('makes the directory a key has in it', async () => {
    const key = `files/${randomUUID()}/Listino-2026.pdf`;

    await adapter.put({
      key,
      data: new Uint8Array([1]),
      contentType: 'application/pdf',
      downloadName: 'Listino-2026.pdf',
    });

    expect(await fileExists(join(uploadDir, key))).toBe(true);
  });

  it.each(['../outside.webp', 'files/../../outside.webp', ''])(
    'refuses to write %j, which is not inside its directory',
    async (key) => {
      await expect(
        adapter.put({
          key,
          data: new Uint8Array([1]),
          contentType: 'image/webp',
        }),
      ).rejects.toThrow(/inside the upload directory/);
    },
  );

  it('keeps a key that looks absolute inside its directory', async () => {
    await adapter.put({
      key: '/abs.webp',
      data: new Uint8Array([1]),
      contentType: 'image/webp',
    });

    expect(await fileExists(join(uploadDir, 'abs.webp'))).toBe(true);
  });

  it('refuses to delete what is not inside its directory', async () => {
    await expect(adapter.delete('../outside.webp')).rejects.toThrow(
      /inside the upload directory/,
    );
  });

  it('exposes its provider as "local"', () => {
    expect(adapter.provider).toBe('local');
  });

  it('getUrl builds a URL under the configured public base', () => {
    expect(adapter.getUrl('abc.webp')).toBe(
      'http://localhost:3000/api/uploads/abc.webp',
    );
  });

  it('delete removes the file, and is idempotent if called again', async () => {
    const key = `${randomUUID()}.webp`;
    await adapter.put({
      key,
      data: new Uint8Array([1]),
      contentType: 'image/webp',
    });
    const filePath = join(uploadDir, key);
    expect(await fileExists(filePath)).toBe(true);

    await adapter.delete(key);
    expect(await fileExists(filePath)).toBe(false);

    await expect(adapter.delete(key)).resolves.not.toThrow();
  });

  it('removes the directory a file was kept in along with it', async () => {
    const key = `files/${randomUUID()}/nota.txt`;
    await adapter.put({
      key,
      data: new Uint8Array([1]),
      contentType: 'text/plain',
      downloadName: 'nota.txt',
    });

    await adapter.delete(key);

    expect(
      await fileExists(join(uploadDir, key.split('/').slice(0, 2).join('/'))),
    ).toBe(false);
  });

  it('leaves the directory alone while another file is in it', async () => {
    const directory = `files/${randomUUID()}`;
    await adapter.put({
      key: `${directory}/a.txt`,
      data: new Uint8Array([1]),
      contentType: 'text/plain',
    });
    await adapter.put({
      key: `${directory}/b.txt`,
      data: new Uint8Array([2]),
      contentType: 'text/plain',
    });

    await adapter.delete(`${directory}/a.txt`);

    expect(await fileExists(join(uploadDir, `${directory}/b.txt`))).toBe(true);
  });

  it('delete on a never-written key does not throw', async () => {
    await expect(adapter.delete(`${randomUUID()}.webp`)).resolves.not.toThrow();
  });
});
