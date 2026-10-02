import { randomUUID } from 'node:crypto';
import type {
  AttachmentStoragePort,
  StoredAttachment,
  UploadAttachmentInput,
  UploadAttachmentResult,
} from '@kometio/ports';

/**
 * Keeps no bytes, only which files it holds and when each was written,
 * with its urls laid out the way both real stores lay them out: one
 * folder per form. `now` is the clock a spec moves to age a file.
 */
export class FakeAttachmentStorage implements AttachmentStoragePort {
  now: () => Date = () => new Date();
  private readonly stored = new Map<string, Date>();

  async upload(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    const url = `${this.urlPrefixFor(input.formId)}${randomUUID()}.${input.extension}`;
    this.stored.set(url, this.now());
    return { url, filename: input.filename };
  }

  urlPrefixFor(formId: string): string {
    return `https://files.esempio.test/attachments/${formId}/`;
  }

  async *listStored(): AsyncIterable<StoredAttachment> {
    for (const [url, storedAt] of [...this.stored]) yield { url, storedAt };
  }

  async delete(url: string): Promise<void> {
    this.stored.delete(url);
  }

  /** The urls it still holds. */
  urls(): string[] {
    return [...this.stored.keys()];
  }
}
