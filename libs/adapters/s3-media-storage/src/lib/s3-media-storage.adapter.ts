import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { MediaStoragePort, StoredObject } from '@kometio/ports';

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
}

/**
 * Puts what it is given in the bucket. What a file is and what it may be
 * served as were decided before it got here (ADR-0113); what this adds is
 * how a bucket says it: the type and, for a download, the header, which
 * has to be stored with the object because the bucket serves it with no
 * application in the path.
 */
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

  async put(object: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: object.key,
        Body: object.data,
        ContentType: object.contentType,
        ContentDisposition: object.downloadName
          ? attachment(object.downloadName)
          : undefined,
      }),
    );
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

/**
 * `attachment; filename="…"`, with what would end the quoted string — or
 * the header — written out, so that a name cannot add a parameter or a
 * header of its own. The application hands over a name already made safe
 * (`safeDownloadName`); this is the adapter not relying on that.
 */
function attachment(name: string): string {
  const quoted = name.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  return `attachment; filename="${quoted}"`;
}
