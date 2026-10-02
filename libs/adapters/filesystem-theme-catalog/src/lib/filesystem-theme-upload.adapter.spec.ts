import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { themeDataPaths } from '@kometio/theme-archive';
import { FilesystemThemeUploadAdapter } from './filesystem-theme-upload.adapter';

let work: string;
let data: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'theme-upload-'));
  data = join(work, 'data');
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function archiveOf(files: Record<string, string>): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name);
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  const path = join(work, 'upload.zip');
  await writeFile(path, Buffer.concat(chunks));
  return path;
}

const now = () => new Date('2026-09-28T10:00:00.000Z');

describe('FilesystemThemeUploadAdapter', () => {
  it("reads an archive's name, or the reason it cannot be used", async () => {
    const adapter = new FilesystemThemeUploadAdapter(data, now);

    expect(
      await adapter.inspect(
        await archiveOf({
          'theme.json': '{"name":"portfolio"}',
          'theme.css': ':root{}',
        }),
      ),
    ).toEqual({ ok: true, name: 'portfolio' });
    expect(
      await adapter.inspect(await archiveOf({ 'theme.css': ':root{}' })),
    ).toEqual({ ok: false, failure: 'no-manifest' });
  });

  it('takes the archive over and queues it, the status written last', async () => {
    const adapter = new FilesystemThemeUploadAdapter(data, now);
    const archive = await archiveOf({ a: 'b' });

    const status = await adapter.enqueue(archive, 'portfolio');

    expect(status).toMatchObject({
      name: 'portfolio',
      state: 'queued',
      createdAt: '2026-09-28T10:00:00.000Z',
    });
    const upload = themeDataPaths(data).upload(status.id);
    await expect(access(upload.archive)).resolves.toBeUndefined();
    await expect(access(archive)).rejects.toThrow();
    expect(JSON.parse(await readFile(upload.status, 'utf8'))).toEqual(status);
    expect(await adapter.status(status.id)).toEqual(status);
  });

  it('answers nothing for an id that is not an upload, however it is spelled', async () => {
    const adapter = new FilesystemThemeUploadAdapter(data, now);

    expect(
      await adapter.status('0b1c2d3e-4f50-4617-8899-aabbccddeeff'),
    ).toBeNull();
    for (const id of ['../../etc', '..', 'a/b', '']) {
      expect(await adapter.status(id)).toBeNull();
    }
  });
});
