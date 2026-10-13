import { LocalDiskAttachmentStorageAdapter } from '@kometio/local-disk-attachment-storage';
import { LocalDiskMediaStorageAdapter } from '@kometio/local-disk-media-storage';
import type {
  AttachmentStoragePort,
  MediaStoragePort,
  StoredAttachment,
  StoredObject,
  UploadAttachmentInput,
  UploadAttachmentResult,
} from '@kometio/ports';
import { S3AttachmentStorageAdapter } from '@kometio/s3-attachment-storage';
import { S3MediaStorageAdapter } from '@kometio/s3-media-storage';
import { requiredIn, type ApiEnv } from '../../env-schema';
import { DEFAULT_MIN_FREE_MB, assertRoomFor } from './disk-room';

/*
 * Media and form attachments live on the same storage, chosen once by
 * MEDIA_STORAGE_PROVIDER: local disk unless it says `s3` (ADR-0013's
 * default), kept apart by an "attachments" prefix in each adapter. A
 * deployment that chose S3 for media wants its attachments there too, and
 * a second variable would only be one more to keep in step.
 */

export function createMediaStorage(env: ApiEnv): MediaStoragePort {
  if (env.MEDIA_STORAGE_PROVIDER === 's3') {
    return new S3MediaStorageAdapter(s3Settings(env));
  }
  const local = localSettings(env);
  return new RoomGuardedMediaStorage(
    new LocalDiskMediaStorageAdapter(local),
    local.uploadDir,
    reserveBytes(env),
  );
}

export function createAttachmentStorage(env: ApiEnv): AttachmentStoragePort {
  if (env.MEDIA_STORAGE_PROVIDER === 's3') {
    return new S3AttachmentStorageAdapter(s3Settings(env));
  }
  const local = localSettings(env);
  return new RoomGuardedAttachmentStorage(
    new LocalDiskAttachmentStorageAdapter(local),
    local.uploadDir,
    reserveBytes(env),
  );
}

function localSettings(env: ApiEnv) {
  return { uploadDir: env.MEDIA_UPLOAD_DIR, publicBaseUrl: env.API_PUBLIC_URL };
}

const reserveBytes = (env: ApiEnv) =>
  (env.MEDIA_MIN_FREE_MB ?? DEFAULT_MIN_FREE_MB) * 1024 * 1024;

/**
 * A local disk that does not take a file it has no room for (docs/adr/0120).
 * The adapters write what they are given and keep it inside their folder; how
 * much of the disk is left for the database that shares it is this
 * deployment's concern, so it is said here, once, for both.
 */
class RoomGuardedMediaStorage implements MediaStoragePort {
  readonly provider: MediaStoragePort['provider'];

  constructor(
    private readonly inner: MediaStoragePort,
    private readonly directory: string,
    private readonly reserve: number,
  ) {
    this.provider = inner.provider;
  }

  async put(object: StoredObject): Promise<void> {
    await assertRoomFor(this.directory, object.data.length, this.reserve);
    await this.inner.put(object);
  }

  getUrl(storageKey: string): string {
    return this.inner.getUrl(storageKey);
  }

  delete(storageKey: string): Promise<void> {
    return this.inner.delete(storageKey);
  }
}

class RoomGuardedAttachmentStorage implements AttachmentStoragePort {
  constructor(
    private readonly inner: AttachmentStoragePort,
    private readonly directory: string,
    private readonly reserve: number,
  ) {}

  async upload(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    await assertRoomFor(this.directory, input.data.length, this.reserve);
    return this.inner.upload(input);
  }

  urlPrefixFor(formId: string): string {
    return this.inner.urlPrefixFor(formId);
  }

  listStored(): AsyncIterable<StoredAttachment> {
    return this.inner.listStored();
  }

  delete(url: string): Promise<void> {
    return this.inner.delete(url);
  }
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
