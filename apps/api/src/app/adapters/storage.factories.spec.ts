import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageFullError } from '@kometio/domain-core';
import { S3AttachmentStorageAdapter } from '@kometio/s3-attachment-storage';
import { S3MediaStorageAdapter } from '@kometio/s3-media-storage';
import { testApiEnv } from '../../test/api-env.test-fixture';
import {
  createAttachmentStorage,
  createMediaStorage,
} from './storage.factories';

const s3 = testApiEnv({
  MEDIA_STORAGE_PROVIDER: 's3',
  S3_MEDIA_BUCKET: 'kometio-media',
  S3_MEDIA_REGION: 'us-east-1',
  S3_MEDIA_ENDPOINT: 'http://localhost:9000',
  S3_MEDIA_FORCE_PATH_STYLE: 'true',
  S3_MEDIA_ACCESS_KEY_ID: 'an-invented-key',
  S3_MEDIA_SECRET_ACCESS_KEY: 'an-invented-secret',
  S3_MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/kometio-media',
});

describe('createMediaStorage', () => {
  it('defaults to local disk', () => {
    const storage = createMediaStorage(testApiEnv());

    expect(storage.provider).toBe('local');
    expect(storage.getUrl('abc.webp')).toBe(
      'http://localhost:3000/api/uploads/abc.webp',
    );
  });

  it('builds the S3 adapter when MEDIA_STORAGE_PROVIDER=s3', () => {
    const storage = createMediaStorage(s3);

    expect(storage).toBeInstanceOf(S3MediaStorageAdapter);
    expect(storage.getUrl('abc.webp')).toBe(
      'http://localhost:9000/kometio-media/abc.webp',
    );
  });

  it('fails loudly when S3 is chosen without its bucket, rather than falling back', () => {
    expect(() =>
      createMediaStorage({ ...s3, S3_MEDIA_BUCKET: undefined }),
    ).toThrow(/Missing required environment variable: S3_MEDIA_BUCKET/);
  });
});

describe('createAttachmentStorage', () => {
  it('uses the same storage media does', () => {
    expect(createAttachmentStorage(s3)).toBeInstanceOf(
      S3AttachmentStorageAdapter,
    );
  });

  it('fails loudly when S3 is chosen without its bucket', () => {
    expect(() =>
      createAttachmentStorage({ ...s3, S3_MEDIA_BUCKET: undefined }),
    ).toThrow(/Missing required environment variable: S3_MEDIA_BUCKET/);
  });
});

/*
 * The single image keeps its uploads on the volume its database writes to
 * (docs/adr/0120): a library that fills the disk is a database that cannot
 * write, so a file that would leave less than the reserve is refused.
 */
describe('a local disk that keeps room for the rest of the server', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'kometio-room-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const local = (reserveMb: number) =>
    testApiEnv({ MEDIA_UPLOAD_DIR: directory, MEDIA_MIN_FREE_MB: reserveMb });

  const IMAGE = {
    key: 'a.webp',
    data: new Uint8Array([1, 2, 3]),
    contentType: 'image/webp',
  };

  it('refuses a file when the disk would be left with less than the reserve, and writes nothing', async () => {
    const storage = createMediaStorage(local(1024 ** 3));

    await expect(storage.put(IMAGE)).rejects.toBeInstanceOf(StorageFullError);
    expect(await readdir(directory)).toEqual([]);
  });

  it('takes it when there is room', async () => {
    const storage = createMediaStorage(local(1));

    await storage.put(IMAGE);

    expect(await readdir(directory)).toEqual(['a.webp']);
  });

  it('keeps a reserve of a gigabyte when nobody says otherwise, and none when told 0', async () => {
    await expect(
      createMediaStorage(testApiEnv({ MEDIA_UPLOAD_DIR: directory })).put(
        IMAGE,
      ),
    ).resolves.toBeUndefined();
    await expect(
      createMediaStorage(local(0)).put({ ...IMAGE, key: 'b.webp' }),
    ).resolves.toBeUndefined();
  });

  it('is asked of the form attachments too, which anybody may send', async () => {
    const storage = createAttachmentStorage(local(1024 ** 3));

    await expect(
      storage.upload({
        formId: '0f6c1e7e-0000-4000-8000-000000000000',
        filename: 'cv.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        data: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toBeInstanceOf(StorageFullError);
  });
});
