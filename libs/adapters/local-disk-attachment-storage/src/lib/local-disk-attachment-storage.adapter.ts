import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import {
  isStoredAttachmentPath,
  type AttachmentStoragePort,
  type StoredAttachment,
  type UploadAttachmentInput,
  type UploadAttachmentResult,
} from '@kometio/ports';

export interface LocalDiskAttachmentStorageOptions {
  /** Written under `${uploadDir}/attachments` — a subfolder of the same
   * directory MediaStoragePort's own LocalDisk adapter serves from
   * (apps/api's main.ts already serves the whole tree via express.static,
   * no extra route needed), kept in its own prefix so a form attachment
   * is never mistaken for a curated media-library image. */
  uploadDir: string;
  /** Origin the returned URLs are built against — same role as MediaStoragePort's own publicBaseUrl. */
  publicBaseUrl: string;
}

const FORM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** No image processing of any kind, unlike MediaStoragePort's LocalDisk adapter — raw bytes in, raw bytes out. */
export class LocalDiskAttachmentStorageAdapter implements AttachmentStoragePort {
  constructor(private readonly options: LocalDiskAttachmentStorageOptions) {}

  async upload(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    // The form's id becomes a folder name here: anything but an id, and a
    // `../` in it would write outside the attachments folder.
    if (!FORM_ID.test(input.formId)) {
      throw new Error(`Not a form id: ${input.formId}`);
    }
    const formDir = join(this.root, input.formId);
    await mkdir(formDir, { recursive: true });

    const fileName = `${randomUUID()}.${input.extension}`;
    await writeFile(join(formDir, fileName), input.data);

    return {
      url: `${this.urlPrefixFor(input.formId)}${fileName}`,
      filename: input.filename,
    };
  }

  urlPrefixFor(formId: string): string {
    return `${this.rootUrl}${formId}/`;
  }

  async *listStored(): AsyncIterable<StoredAttachment> {
    for (const path of await this.storedPaths()) {
      const { mtime } = await stat(join(this.root, path));
      yield { url: `${this.rootUrl}${path}`, storedAt: mtime };
    }
  }

  async delete(url: string): Promise<void> {
    const path = url.startsWith(this.rootUrl)
      ? url.slice(this.rootUrl.length)
      : '';
    // Only a path upload could have written: never `..`, never another
    // folder of the upload directory.
    if (!isStoredAttachmentPath(path)) {
      throw new Error(`Not a stored attachment: ${url}`);
    }
    await unlink(join(this.root, path)).catch((error: unknown) => {
      if (!isMissingFile(error)) throw error;
    });
  }

  private get root(): string {
    return join(this.options.uploadDir, 'attachments');
  }

  private get rootUrl(): string {
    return `${this.options.publicBaseUrl}/uploads/attachments/`;
  }

  /** Every file under the root in the shape upload writes; anything else is not this store's. */
  private async storedPaths(): Promise<string[]> {
    const entries = await readdir(this.root, {
      recursive: true,
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (isMissingFile(error)) return [];
      throw error;
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        join(entry.parentPath, entry.name).slice(this.root.length + 1),
      )
      .filter(isStoredAttachmentPath);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
