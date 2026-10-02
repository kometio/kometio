import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyWorkspace,
  requestBuild,
  runRequestedBuild,
} from './build-exchange';

let root: string;
let workspace: string;
let exchange: string;
let scratch: string;

/**
 * A workspace with packages and a build script: the script writes what a
 * site build leaves, or fails, as the theme it is given says.
 */
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'build-exchange-'));
  workspace = join(root, 'workspace');
  exchange = join(root, 'exchange');
  scratch = join(root, 'scratch');
  await mkdir(join(workspace, 'node_modules', 'astro'), { recursive: true });
  await writeFile(join(workspace, 'node_modules', 'astro', 'index.js'), 'a');
  await mkdir(join(workspace, 'node_modules', '@nestjs', 'core'), {
    recursive: true,
  });
  await mkdir(join(workspace, 'apps', 'public-site', 'node_modules'), {
    recursive: true,
  });
  await mkdir(join(workspace, 'tools'), { recursive: true });
  await mkdir(join(workspace, 'themes', 'classic'), { recursive: true });
  await writeFile(
    join(workspace, 'tools', 'build-public-site-with-theme.mjs'),
    `import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const name = process.argv[2];
const css = readFileSync('themes/' + name + '/theme.css', 'utf8');
console.log('building', name);
if (css.includes('broken')) { console.error('it broke'); process.exit(1); }
mkdirSync('apps/public-site/dist', { recursive: true });
writeFileSync('apps/public-site/dist/compatibility', 'stamp');
// A build writes caches beside the packages it reads.
mkdirSync('apps/public-site/node_modules/.vite', { recursive: true });
`,
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function theme(css: string): Promise<string> {
  const directory = join(root, 'source', css.length.toString());
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'theme.css'), css);
  return directory;
}

const fast = { timeoutMs: 20_000, pollMs: 20 };

describe('copyWorkspace', () => {
  it('copies the files and links the packages, leaving the originals as they are', async () => {
    const copy = join(scratch, 'copy');
    await copyWorkspace(workspace, copy);

    // To the real path: macOS puts the temp directory behind a link.
    expect(await readlink(join(copy, 'node_modules', 'astro'))).toBe(
      await realpath(join(workspace, 'node_modules', 'astro')),
    );
    expect(await readlink(join(copy, 'node_modules', '@nestjs', 'core'))).toBe(
      await realpath(join(workspace, 'node_modules', '@nestjs', 'core')),
    );
    expect(await readdir(join(copy, 'themes'))).toEqual(['classic']);

    // A new file in the copy's node_modules lands in the copy only.
    await writeFile(join(copy, 'node_modules', '.cache'), 'x');
    expect(await readdir(join(workspace, 'node_modules'))).not.toContain(
      '.cache',
    );
  });
});

describe('requestBuild and runRequestedBuild', () => {
  it('hands a build over and brings the built site back', async () => {
    const log = join(root, 'build.log');
    const requesting = requestBuild(
      exchange,
      'job-1',
      {
        name: 'portfolio',
        themes: new Map([['portfolio', await theme(':root{}')]]),
      },
      log,
      fast,
    );
    // The runner, once the request is there.
    while (
      !(await runRequestedBuild({
        exchange,
        workspace,
        scratch,
        timeoutMs: 20_000,
      }))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const dist = await requesting;
    expect(dist).toBe(join(exchange, 'job', 'dist'));
    expect(await readFile(join(dist ?? '', 'compatibility'), 'utf8')).toBe(
      'stamp',
    );
    expect(await readFile(log, 'utf8')).toContain('building portfolio');
    // The copy it built in is gone; the workspace was never written.
    expect(await readdir(scratch)).toEqual([]);
    await expect(
      readdir(join(workspace, 'themes', 'portfolio')),
    ).rejects.toThrow();
  });

  it('reports a build that failed, with its output', async () => {
    const log = join(root, 'build.log');
    const requesting = requestBuild(
      exchange,
      'job-2',
      {
        name: 'broken',
        themes: new Map([['broken', await theme(':root{} /* broken */')]]),
      },
      log,
      fast,
    );
    while (
      !(await runRequestedBuild({
        exchange,
        workspace,
        scratch,
        timeoutMs: 20_000,
      }))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(await requesting).toBeNull();
    expect(await readFile(log, 'utf8')).toContain('it broke');
  });

  it('gives up on a build nobody runs', async () => {
    const log = join(root, 'build.log');
    const dist = await requestBuild(
      exchange,
      'job-3',
      { name: 'x', themes: new Map() },
      log,
      { timeoutMs: 100, pollMs: 20 },
    );

    expect(dist).toBeNull();
    expect(await readFile(log, 'utf8')).toContain('did not finish in time');
  });
});
