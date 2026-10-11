import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeAtomically } from './atomic-write';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kometio-atomic-write-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('writeAtomically', () => {
  it('writes the file, in a folder that is not there yet', async () => {
    const target = join(root, 'a', 'b', 'result.json');

    await writeAtomically(target, '{"ok":true}');

    expect(await readFile(target, 'utf8')).toBe('{"ok":true}');
  });

  it('replaces what was there, and leaves no temporary file beside it', async () => {
    const target = join(root, 'current.json');
    await writeFile(target, 'old');

    await writeAtomically(target, 'new');

    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(root)).toEqual(['current.json']);
  });
});
