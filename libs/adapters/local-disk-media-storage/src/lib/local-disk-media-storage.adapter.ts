import { mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { MediaStoragePort, StoredObject } from '@kometio/ports';

export interface LocalDiskMediaStorageOptions {
  /** Absolute path files are written to and served from (see ADR-0013 —
   * apps/api serves this directory directly, no separate reverse-proxy route). */
  uploadDir: string;
  /** Origin the returned URLs are built against, e.g. http://localhost:3000/api. */
  publicBaseUrl: string;
}

/**
 * Writes what it is given under `uploadDir`, and serves nothing: what a
 * file is, what it is called and what a browser may do with it were
 * decided before it got here (ADR-0113). What stays here is the one rule
 * that is the disk's own: nothing is written outside the directory.
 */
export class LocalDiskMediaStorageAdapter implements MediaStoragePort {
  readonly provider = 'local' as const;

  constructor(private readonly options: LocalDiskMediaStorageOptions) {}

  async put(object: StoredObject): Promise<void> {
    const path = this.pathOf(object.key);
    // A key can hold a directory (a download keeps the name it was
    // uploaded with, in a directory of its own).
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, object.data);
  }

  getUrl(storageKey: string): string {
    return `${this.options.publicBaseUrl}/uploads/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const path = this.pathOf(storageKey);
    try {
      await unlink(path);
    } catch (error) {
      // Already gone is fine — delete is idempotent from the caller's
      // point of view (matches PageRepositoryPort.delete's semantics).
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    // A key with a directory in it was given one of its own: leaving the
    // empty directory behind would grow the tree by one entry for every
    // file anybody ever deleted. `rmdir` refuses one that is not empty.
    if (storageKey.includes('/')) {
      await rmdir(dirname(path)).catch(() => undefined);
    }
  }

  /** The path a key is kept at, and never one outside the upload directory. */
  private pathOf(key: string): string {
    const path = join(this.options.uploadDir, key);
    const inside = relative(this.options.uploadDir, path);
    if (inside === '' || inside.startsWith('..')) {
      throw new Error(`Not a key inside the upload directory: ${key}`);
    }
    return path;
  }
}
