import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { classifyUpload, safeDownloadName } from '@kometio/domain-core';
import type {
  ImageOptimizerPort,
  MediaStoragePort,
  UploadMediaInput,
  UploadMediaResult,
} from '@kometio/ports';

export interface S3MediaStorageOptions {
  bucket: string;
  region: string;
  /** Custom endpoint for an S3-compatible backend (e.g. MinIO) — omit for real AWS S3. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Required by MinIO (path-style bucket URLs); AWS S3 works with either. */
  forcePathStyle?: boolean;
  /** Origin (+ optional path prefix) the returned URLs are built against — same role as LocalDiskMediaStorageOptions.publicBaseUrl, e.g. a CDN in front of the bucket or the bucket's own public endpoint. */
  publicBaseUrl: string;
  /** What a picture becomes before it is stored (ADR-0013) — the same one the local adapter is given. */
  imageOptimizer: ImageOptimizerPort;
}

export class S3MediaStorageAdapter implements MediaStoragePort {
  readonly provider = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly options: S3MediaStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async upload(input: UploadMediaInput): Promise<UploadMediaResult> {
    // The bytes decide what may be opened, not the declared type — see
    // the same call in LocalDiskMediaStorageAdapter, and ADR-0054/0070.
    const sniffed = classifyUpload(input.data, input.filename);

    if (!sniffed.inline) {
      const name = safeDownloadName(input.filename);
      const key = `files/${randomUUID()}/${name}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: input.data,
          ContentType: sniffed.mimeType,
          // The bucket serves the file, not our API, so the rule
          // media-static.ts applies to `files/` has to travel with the
          // object itself: a download, never a page a browser renders.
          ContentDisposition: `attachment; filename="${name}"`,
        }),
      );
      return {
        storageKey: key,
        mimeType: sniffed.mimeType,
        size: input.data.byteLength,
        width: 0,
        height: 0,
      };
    }

    if (sniffed.kind !== 'image') {
      const key = `${randomUUID()}.${sniffed.extension}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: input.data,
          // The SNIFFED type, never the declared one: this header is what
          // a browser trusts when it plays the file back.
          ContentType: sniffed.mimeType,
        }),
      );
      return {
        storageKey: key,
        mimeType: sniffed.mimeType,
        size: input.data.byteLength,
        // See the local adapter: reading a container's dimensions means
        // decoding it, and nothing needs them for these two.
        width: 0,
        height: 0,
      };
    }

    const image = await this.options.imageOptimizer.optimize(input.data);

    const storageKey = `${randomUUID()}.${image.extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        Body: image.data,
        ContentType: image.mimeType,
      }),
    );

    return {
      storageKey,
      mimeType: image.mimeType,
      size: image.data.byteLength,
      width: image.width,
      height: image.height,
    };
  }

  getUrl(storageKey: string): string {
    return `${this.options.publicBaseUrl}/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    // S3's DeleteObjectCommand doesn't error on an already-missing key —
    // same idempotent-from-the-caller's-view semantics as
    // LocalDiskMediaStorageAdapter.delete(), no ENOENT-style catch needed.
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
      }),
    );
  }
}
