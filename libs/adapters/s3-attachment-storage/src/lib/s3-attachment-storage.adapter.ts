import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  isStoredAttachmentPath,
  type AttachmentStoragePort,
  type StoredAttachment,
  type UploadAttachmentInput,
  type UploadAttachmentResult,
} from '@kometio/ports';

export interface S3AttachmentStorageOptions {
  bucket: string;
  region: string;
  /** Custom endpoint for an S3-compatible backend (e.g. MinIO) — omit for real AWS S3. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  /** Origin the returned URLs are built against — same role as MediaStoragePort's own publicBaseUrl. */
  publicBaseUrl: string;
}

const ROOT = 'attachments/';

/** No image processing of any kind, unlike MediaStoragePort's S3 adapter — raw bytes in, raw bytes out. Same "attachments/" key prefix reasoning as the LocalDisk sibling adapter. */
export class S3AttachmentStorageAdapter implements AttachmentStoragePort {
  private readonly client: S3Client;

  constructor(private readonly options: S3AttachmentStorageOptions) {
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

  async upload(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    const storageKey = `${this.keyPrefixFor(input.formId)}${randomUUID()}.${input.extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        Body: input.data,
        ContentType: input.mimeType,
      }),
    );

    return {
      url: `${this.options.publicBaseUrl}/${storageKey}`,
      filename: input.filename,
    };
  }

  urlPrefixFor(formId: string): string {
    return `${this.options.publicBaseUrl}/${this.keyPrefixFor(formId)}`;
  }

  async *listStored(): AsyncIterable<StoredAttachment> {
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: ROOT,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (
          object.Key &&
          object.LastModified &&
          isStoredAttachmentPath(object.Key.slice(ROOT.length))
        ) {
          yield {
            url: `${this.options.publicBaseUrl}/${object.Key}`,
            storedAt: object.LastModified,
          };
        }
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
  }

  async delete(url: string): Promise<void> {
    const rootUrl = `${this.options.publicBaseUrl}/${ROOT}`;
    const path = url.startsWith(rootUrl) ? url.slice(rootUrl.length) : '';
    if (!isStoredAttachmentPath(path)) {
      throw new Error(`Not a stored attachment: ${url}`);
    }
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: ROOT + path,
      }),
    );
  }

  private keyPrefixFor(formId: string): string {
    return `${ROOT}${formId}/`;
  }
}
