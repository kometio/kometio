import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Written beside and renamed over: a reader sees the old file or the new
 * one, never half of one. The temporary name carries the process id, so two
 * processes writing the same file do not write into each other's.
 */
export async function writeAtomically(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}
