import { LocalDiskAttachmentStorageAdapter } from '@kometio/local-disk-attachment-storage';
import { LocalDiskMediaStorageAdapter } from '@kometio/local-disk-media-storage';
import type { AttachmentStoragePort, MediaStoragePort } from '@kometio/ports';
import { S3AttachmentStorageAdapter } from '@kometio/s3-attachment-storage';
import { S3MediaStorageAdapter } from '@kometio/s3-media-storage';
import { SharpImageOptimizer } from '@kometio/sharp-image-optimizer';
import { requiredIn, type ApiEnv } from '../../env-schema';

/*
 * Media and form attachments live on the same storage, chosen once by
 * MEDIA_STORAGE_PROVIDER: local disk unless it says `s3` (ADR-0013's
 * default), kept apart by an "attachments" prefix in each adapter. A
 * deployment that chose S3 for media wants its attachments there too, and
 * a second variable would only be one more to keep in step.
 */

export function createMediaStorage(env: ApiEnv): MediaStoragePort {
  // The one thing both backends do the same with a picture, given to either.
  const imageOptimizer = new SharpImageOptimizer();
  return env.MEDIA_STORAGE_PROVIDER === 's3'
    ? new S3MediaStorageAdapter({ ...s3Settings(env), imageOptimizer })
    : new LocalDiskMediaStorageAdapter({
        ...localSettings(env),
        imageOptimizer,
      });
}

export function createAttachmentStorage(env: ApiEnv): AttachmentStoragePort {
  return env.MEDIA_STORAGE_PROVIDER === 's3'
    ? new S3AttachmentStorageAdapter(s3Settings(env))
    : new LocalDiskAttachmentStorageAdapter(localSettings(env));
}

function localSettings(env: ApiEnv) {
  return { uploadDir: env.MEDIA_UPLOAD_DIR, publicBaseUrl: env.API_PUBLIC_URL };
}

function s3Settings(env: ApiEnv) {
  return {
    bucket: requiredIn(env, 'S3_MEDIA_BUCKET'),
    region: requiredIn(env, 'S3_MEDIA_REGION'),
    endpoint: env.S3_MEDIA_ENDPOINT,
    forcePathStyle: env.S3_MEDIA_FORCE_PATH_STYLE === 'true',
    accessKeyId: requiredIn(env, 'S3_MEDIA_ACCESS_KEY_ID'),
    secretAccessKey: requiredIn(env, 'S3_MEDIA_SECRET_ACCESS_KEY'),
    publicBaseUrl: requiredIn(env, 'S3_MEDIA_PUBLIC_BASE_URL'),
  };
}
