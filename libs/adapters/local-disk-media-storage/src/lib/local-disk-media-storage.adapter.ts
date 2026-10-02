import { randomUUID } from 'node:crypto';
import { mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { classifyUpload, safeDownloadName } from '@kometio/domain-core';
import type {
  ImageOptimizerPort,
  MediaStoragePort,
  UploadMediaInput,
  UploadMediaResult,
} from '@kometio/ports';

export interface LocalDiskMediaStorageOptions {
  /** Absolute path files are written to and served from (see ADR-0013 —
   * apps/api serves this directory directly, no separate reverse-proxy route). */
  uploadDir: string;
  /** Origin the returned URLs are built against, e.g. http://localhost:3000/api. */
  publicBaseUrl: string;
  /** What a picture becomes before it is written (ADR-0013). */
  imageOptimizer: ImageOptimizerPort;
}

export class LocalDiskMediaStorageAdapter implements MediaStoragePort {
  readonly provider = 'local' as const;

  constructor(private readonly options: LocalDiskMediaStorageOptions) {}

  async upload(input: UploadMediaInput): Promise<UploadMediaResult> {
    // The file's own bytes decide what may be OPENED, not the declared
    // type (ADR-0054): a caller can set any header it likes. What the
    // bytes do not vouch for is still taken (ADR-0070), but only as a
    // download — see media-static.ts, which serves `files/` that way.
    const sniffed = classifyUpload(input.data, input.filename);

    if (!sniffed.inline) {
      // Its own directory, so the file can keep the name it was uploaded
      // with: a download is saved under the last segment of its address,
      // and "listino-2026.pdf" should arrive as that, not as a UUID.
      const key = `files/${randomUUID()}/${safeDownloadName(input.filename)}`;
      await mkdir(dirname(join(this.options.uploadDir, key)), {
        recursive: true,
      });
      await writeFile(join(this.options.uploadDir, key), input.data);
      return {
        storageKey: key,
        mimeType: sniffed.mimeType,
        size: input.data.byteLength,
        width: 0,
        height: 0,
      };
    }

    if (sniffed.kind !== 'image') {
      await mkdir(this.options.uploadDir, { recursive: true });
      const key = `${randomUUID()}.${sniffed.extension}`;
      await writeFile(join(this.options.uploadDir, key), input.data);
      return {
        storageKey: key,
        mimeType: sniffed.mimeType,
        size: input.data.byteLength,
        // A video has pixel dimensions and an audio file does not, but
        // reading a container's dimensions means decoding it — a
        // different kind of dependency than sharp. Left unset rather than
        // guessed: `width`/`height` are nullable for exactly this, and
        // nothing in the renderer needs them for these two.
        width: 0,
        height: 0,
      };
    }

    const image = await this.options.imageOptimizer.optimize(input.data);

    await mkdir(this.options.uploadDir, { recursive: true });
    const storageKey = `${randomUUID()}.${image.extension}`;
    await writeFile(join(this.options.uploadDir, storageKey), image.data);

    return {
      storageKey,
      mimeType: image.mimeType,
      size: image.data.byteLength,
      width: image.width,
      height: image.height,
    };
  }

  getUrl(storageKey: string): string {
    return `${this.options.publicBaseUrl}/uploads/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(join(this.options.uploadDir, storageKey));
    } catch (error) {
      // Already gone is fine — delete is idempotent from the caller's
      // point of view (matches PageRepositoryPort.delete's semantics).
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    // A download lives alone in its own directory; leaving the empty
    // directory behind would grow `files/` by one entry for every file
    // anybody ever deleted.
    if (storageKey.startsWith('files/')) {
      await rmdir(dirname(join(this.options.uploadDir, storageKey))).catch(
        () => undefined,
      );
    }
  }
}
