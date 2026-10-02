import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import {
  THEME_ARCHIVE_LIMITS,
  ThemeArchiveError,
  extractThemeArchive,
  inspectThemeArchive,
} from './theme-archive';

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'theme-archive-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

type Content = string | Buffer | { link: string };

/** A zip built the way a person's zipper would, written to a file as the API receives it. */
async function zipOf(files: Record<string, Content>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    if (typeof content === 'object' && !Buffer.isBuffer(content)) {
      zip.addBuffer(Buffer.from(content.link), name, { mode: 0o120777 });
    } else {
      zip.addBuffer(Buffer.from(content), name);
    }
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function saved(bytes: Buffer): Promise<string> {
  const path = join(work, 'theme.zip');
  await writeFile(path, bytes);
  return path;
}

const theme = {
  'theme.json': JSON.stringify({
    name: 'portfolio',
    allowStyleOverrides: true,
  }),
  'theme.css': ':root { --primary: red; }',
  'regions/Header.astro': '<header />',
  'fonts/Fraunces.woff2': Buffer.from([1, 2, 3]),
  'fonts/OFL.txt': 'licence',
};

async function refusal(bytes: Buffer): Promise<string> {
  try {
    await inspectThemeArchive(await saved(bytes));
  } catch (error) {
    if (error instanceof ThemeArchiveError) return error.problem;
    throw error;
  }
  throw new Error('The archive was accepted.');
}

describe('inspectThemeArchive', () => {
  it('reads a theme whose files are at the top of the archive', async () => {
    const archive = await inspectThemeArchive(await saved(await zipOf(theme)));

    expect(archive.name).toBe('portfolio');
    expect(archive.manifest).toMatchObject({ allowStyleOverrides: true });
    expect([...archive.files].sort()).toEqual(Object.keys(theme).sort());
    expect(archive.skipped).toEqual([]);
  });

  /*
   * GitHub's "Download ZIP" puts the repository under `<repo>-<branch>/`,
   * with its own furniture beside the theme. That is the zip most people
   * will have, so it has to work as it comes.
   */
  it("takes a repository's zip as it comes: one folder on top, its own files left out", async () => {
    const files = Object.fromEntries(
      Object.entries({
        ...theme,
        Dockerfile: 'FROM x',
        '.github/workflows/build.yml': 'on: push',
        '.gitignore': 'node_modules',
        'node_modules/x/index.js': 'x',
        'README.md': '# Portfolio',
      }).map(([path, content]) => [
        `kometio-theme-portfolio-main/${path}`,
        content,
      ]),
    );
    const archive = await inspectThemeArchive(await saved(await zipOf(files)));

    expect([...archive.files].sort()).toEqual(
      [...Object.keys(theme), 'README.md'].sort(),
    );
    expect([...archive.skipped].sort()).toEqual([
      '.github/workflows/build.yml',
      '.gitignore',
      'Dockerfile',
      'node_modules/x/index.js',
    ]);
  });

  it('refuses a theme with no theme.json, no theme.css, or no usable name', async () => {
    const without = (name: string) =>
      Object.fromEntries(
        Object.entries(theme).filter(([path]) => path !== name),
      );
    const noManifest = without('theme.json');
    const noStylesheet = without('theme.css');

    expect(await refusal(await zipOf(noManifest))).toBe('no-manifest');
    expect(await refusal(await zipOf(noStylesheet))).toBe('no-stylesheet');
    for (const manifest of [
      '{}',
      JSON.stringify({ name: 'Portfolio Theme' }),
      JSON.stringify({ name: '../classic' }),
      JSON.stringify({ name: 'x'.repeat(41) }),
    ]) {
      expect(
        await refusal(await zipOf({ ...theme, 'theme.json': manifest })),
      ).toBe('bad-name');
    }
    expect(
      await refusal(await zipOf({ ...theme, 'theme.json': '{ not json' })),
    ).toBe('bad-manifest');
    expect(
      await refusal(await zipOf({ ...theme, 'theme.json': '["a"]' })),
    ).toBe('bad-manifest');
  });

  it('refuses a link, which could point anywhere on the server', async () => {
    expect(
      await refusal(
        await zipOf({ ...theme, 'fonts/evil': { link: '/etc/passwd' } }),
      ),
    ).toBe('link');
  });

  it('refuses a path that climbs out of the theme', async () => {
    // A zipper will not write `../` for you: the name is patched in place,
    // in the local header and the central directory alike.
    const bytes = await zipOf({ ...theme, 'aa/evil.css': 'x' });
    const patched = Buffer.from(
      bytes.toString('latin1').replaceAll('aa/evil.css', '../evil.css'),
      'latin1',
    );

    expect(await refusal(patched)).toBe('unsafe-path');
  });

  it('refuses an encrypted entry', async () => {
    const bytes = await zipOf(theme);
    // Bit 0 of the general purpose flags, in every central directory
    // record (signature PK\x01\x02, flags at offset 8).
    let at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    while (at !== -1) {
      bytes[at + 8] = (bytes[at + 8] ?? 0) | 1;
      at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 4);
    }

    expect(await refusal(bytes)).toBe('encrypted');
  });

  // Compressing the 80 MB it takes is what is slow, not the check.
  it('refuses what unpacks too large', { timeout: 30_000 }, async () => {
    const bomb = Buffer.alloc(THEME_ARCHIVE_LIMITS.unpackedBytes + 1);
    expect(
      await refusal(await zipOf({ ...theme, 'fonts/big.woff2': bomb })),
    ).toBe('too-large');
  });

  it('refuses too many files', async () => {
    const many = Object.fromEntries(
      Array.from({ length: THEME_ARCHIVE_LIMITS.entries }, (_, index) => [
        `icons/${index}.svg`,
        '<svg/>',
      ]),
    );
    expect(await refusal(await zipOf({ ...theme, ...many }))).toBe(
      'too-many-entries',
    );
  });

  it('refuses a file that is not a zip at all', async () => {
    expect(await refusal(Buffer.from('this is not a zip archive'))).toBe(
      'not-a-zip',
    );
  });
});

describe('extractThemeArchive', () => {
  it("writes the theme's files, without its root folder or the skipped ones", async () => {
    const files = Object.fromEntries(
      Object.entries({ ...theme, Dockerfile: 'FROM x' }).map(
        ([path, content]) => [`kometio-theme-portfolio-main/${path}`, content],
      ),
    );
    const destination = join(work, 'out');
    await extractThemeArchive(await saved(await zipOf(files)), destination);

    expect((await readdir(destination, { recursive: true })).sort()).toEqual(
      [
        'fonts',
        'fonts/Fraunces.woff2',
        'fonts/OFL.txt',
        'regions',
        'regions/Header.astro',
        'theme.css',
        'theme.json',
      ].sort(),
    );
    expect(await readFile(join(destination, 'theme.css'), 'utf8')).toBe(
      theme['theme.css'],
    );
  });

  it('writes nothing for an archive it refuses', async () => {
    const destination = join(work, 'out');
    await expect(
      extractThemeArchive(
        await saved(await zipOf({ ...theme, 'x/y': { link: '/etc' } })),
        destination,
      ),
    ).rejects.toBeInstanceOf(ThemeArchiveError);
    await expect(readdir(destination)).rejects.toThrow();
  });
});
