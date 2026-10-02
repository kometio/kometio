import { LocalDiskAttachmentStorageAdapter } from '@kometio/local-disk-attachment-storage';
import { LocalDiskMediaStorageAdapter } from '@kometio/local-disk-media-storage';
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

    expect(storage).toBeInstanceOf(LocalDiskMediaStorageAdapter);
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
    expect(createAttachmentStorage(testApiEnv())).toBeInstanceOf(
      LocalDiskAttachmentStorageAdapter,
    );
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
