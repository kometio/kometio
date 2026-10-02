import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskAttachmentStorageAdapter } from './local-disk-attachment-storage.adapter';

async function fileExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

const formId = '5b0a4c1e-7f3d-4e2a-9c61-2d8e4f1a3b70';

describe('LocalDiskAttachmentStorageAdapter', () => {
  let uploadDir: string;
  let adapter: LocalDiskAttachmentStorageAdapter;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'kometio-attachment-test-'));
    adapter = new LocalDiskAttachmentStorageAdapter({
      uploadDir,
      publicBaseUrl: 'http://localhost:3000/api',
    });
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('writes a non-image file as-is under its form in an attachments/ subfolder', async () => {
    const data = new TextEncoder().encode('%PDF-1.4 fake pdf content');

    const result = await adapter.upload({
      formId,
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      data,
    });

    expect(result.filename).toBe('cv.pdf');
    expect(result.url).toMatch(
      /^http:\/\/localhost:3000\/api\/uploads\/attachments\/[\w-]+\/[\w-]+\.pdf$/,
    );
    expect(result.url.startsWith(adapter.urlPrefixFor(formId))).toBe(true);
    const fileName = result.url.slice(adapter.urlPrefixFor(formId).length);
    expect(
      await fileExists(join(uploadDir, 'attachments', formId, fileName)),
    ).toBe(true);
  });

  it('preserves the original filename in the result even though the storage key is randomized', async () => {
    const data = new TextEncoder().encode('hello');

    const result1 = await adapter.upload({
      formId,
      filename: 'note.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      data,
    });
    const result2 = await adapter.upload({
      formId,
      filename: 'note.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      data,
    });

    expect(result1.url).not.toBe(result2.url);
    expect(result1.filename).toBe('note.txt');
    expect(result2.filename).toBe('note.txt');
  });

  it('refuses a form id that is not one, rather than write where it points', async () => {
    await expect(
      adapter.upload({
        formId: '../../etc',
        filename: 'x.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        data: new TextEncoder().encode('x'),
      }),
    ).rejects.toThrow('Not a form id');
  });

  describe('listStored and delete', () => {
    const legacyName = '0f8fad5b-d9cb-469f-a165-70867728950e.pdf';

    it('lists what upload wrote, per form and from before, and nothing else', async () => {
      const cv = await adapter.upload({
        formId,
        filename: 'cv.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        data: new TextEncoder().encode('%PDF'),
      });
      await writeFile(join(uploadDir, 'attachments', legacyName), '%PDF');
      await mkdir(join(uploadDir, 'attachments', 'not-a-form'), {
        recursive: true,
      });
      await writeFile(
        join(uploadDir, 'attachments', 'not-a-form', 'notes.txt'),
        'x',
      );

      const urls = [];
      for await (const stored of adapter.listStored()) {
        urls.push(stored.url);
        expect(stored.storedAt).toBeInstanceOf(Date);
      }

      expect(urls.sort()).toEqual(
        [
          cv.url,
          `http://localhost:3000/api/uploads/attachments/${legacyName}`,
        ].sort(),
      );
    });

    it('deletes a stored file by its url, and takes a missing one as done', async () => {
      const cv = await adapter.upload({
        formId,
        filename: 'cv.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        data: new TextEncoder().encode('%PDF'),
      });

      await adapter.delete(cv.url);
      await adapter.delete(cv.url);

      const left = [];
      for await (const stored of adapter.listStored()) left.push(stored);
      expect(left).toEqual([]);
    });

    it('refuses a url that is not a file it stored, rather than delete where it points', async () => {
      await expect(
        adapter.delete(
          'http://localhost:3000/api/uploads/attachments/../media/logo.png',
        ),
      ).rejects.toThrow('Not a stored attachment');
      await expect(
        adapter.delete('https://evil.example/attachments/x.pdf'),
      ).rejects.toThrow('Not a stored attachment');
    });

    it('lists nothing before anything was uploaded', async () => {
      const none = [];
      for await (const stored of adapter.listStored()) none.push(stored);
      expect(none).toEqual([]);
    });
  });
});
