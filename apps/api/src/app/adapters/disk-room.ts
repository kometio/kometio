import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { StorageFullError } from '@kometio/domain-core';

/** Room kept for the rest of the server when nothing says otherwise (docs/adr/0120). */
export const DEFAULT_MIN_FREE_MB = 1024;

/**
 * Refuses a write that would leave the disk `directory` is on with less than
 * `reserveBytes` free. The directory is where files are about to be kept and may
 * not exist yet: the nearest one that does says how much room the disk has.
 */
export async function assertRoomFor(
  directory: string,
  bytes: number,
  reserveBytes: number,
): Promise<void> {
  if (reserveBytes <= 0) return;
  const { bavail, bsize } = await statfs(await nearestExisting(directory));
  if (bavail * bsize - bytes < reserveBytes) throw new StorageFullError();
}

async function nearestExisting(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await statfs(current);
      return current;
    } catch (error) {
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}
