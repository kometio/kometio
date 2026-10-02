import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import yazl from 'yazl';
import type { ThemeUploadStatus } from '@kometio/shared-types';
import { themeDataPaths } from '@kometio/theme-archive';
import { ThemeBuilder, type BuildRequest } from './theme-builder';

let root: string;
let data: string;
let paths: ReturnType<typeof themeDataPaths>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'theme-builder-'));
  data = join(root, 'data');
  paths = themeDataPaths(data);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name);
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const themeFiles = (name: string, css = ':root{}') => ({
  'theme.json': JSON.stringify({ name }),
  'theme.css': css,
});

let clock = 0;
/** An upload waiting, as the API leaves it. */
async function queue(id: string, files: Record<string, string>) {
  const upload = paths.upload(id);
  await mkdir(upload.directory, { recursive: true });
  await writeFile(upload.archive, await zipOf(files));
  const at = new Date(Date.UTC(2026, 8, 28, 0, 0, clock++)).toISOString();
  const status: ThemeUploadStatus = {
    id,
    name: null,
    state: 'queued',
    failure: null,
    log: null,
    createdAt: at,
    updatedAt: at,
  };
  await writeFile(upload.status, JSON.stringify(status));
}

async function statusOf(id: string): Promise<ThemeUploadStatus> {
  return JSON.parse(await readFile(paths.upload(id).status, 'utf8'));
}

/** The themes each build was asked for, name → theme.css, read when it ran. */
const requested: Array<Record<string, string>> = [];

/** A build that writes what a real one leaves: the site's dist, stamped. */
function fakeBuild(result = true) {
  return vi.fn(async (request: BuildRequest, log: string) => {
    const themes: Record<string, string> = {};
    for (const [name, source] of request.themes) {
      themes[name] = await readFile(join(source, 'theme.css'), 'utf8');
    }
    requested.push(themes);
    await writeFile(log, `building ${request.name}\n`);
    if (!result) {
      // Coloured, the way a build prints whatever it is told.
      await writeFile(log, '\u001b[31merror:\u001b[39m something broke\n', {
        flag: 'a',
      });
      return null;
    }
    const dist = join(root, 'out', request.name, 'dist');
    await mkdir(join(dist, 'server'), { recursive: true });
    await writeFile(
      join(dist, 'server', 'entry.mjs'),
      `// built with ${request.name}`,
    );
    await writeFile(join(dist, 'compatibility'), 'stamp-1\n');
    return dist;
  });
}

function builderWith(build: ThemeBuilderBuild) {
  return new ThemeBuilder({
    dataDirectory: data,
    coreThemes: ['classic'],
    runtimeModules: '/app/node_modules',
    build,
  });
}

type ThemeBuilderBuild = ConstructorParameters<typeof ThemeBuilder>[0]['build'];

describe('ThemeBuilder', () => {
  it('builds an upload and publishes the site the public site will switch to', async () => {
    await queue('u1', {
      ...themeFiles('portfolio'),
      'regions/Header.astro': '<header />',
    });
    const build = fakeBuild();

    expect(await builderWith(build).runNext()).toBe(true);

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'portfolio' }),
      paths.upload('u1').log,
    );
    expect(await statusOf('u1')).toMatchObject({
      name: 'portfolio',
      state: 'published',
      failure: null,
    });
    // The volume keeps it, for every next build.
    expect((await readdir(join(paths.installed, 'portfolio'))).sort()).toEqual([
      'regions',
      'theme.css',
      'theme.json',
    ]);
    // The editor's list gets it through the manifest.
    expect(
      JSON.parse(
        await readFile(
          join(paths.manifests, 'portfolio', 'theme.json'),
          'utf8',
        ),
      ),
    ).toEqual({ name: 'portfolio' });
    // The site's build, running on the public site's own packages.
    expect(
      await readFile(
        join(paths.builds, 'u1', 'dist', 'server', 'entry.mjs'),
        'utf8',
      ),
    ).toBe('// built with portfolio');
    expect(await readlink(join(paths.builds, 'u1', 'node_modules'))).toBe(
      '/app/node_modules',
    );
    expect(JSON.parse(await readFile(paths.current, 'utf8'))).toMatchObject({
      build: 'u1',
      compatibility: 'stamp-1',
    });
    // The zip has done its job; the status stays for the editor.
    await expect(readFile(paths.upload('u1').archive)).rejects.toThrow();
    expect((await statusOf('u1')).state).toBe('published');
  });

  it('leaves the site as it was when the build fails, and says why', async () => {
    await queue('u1', themeFiles('portfolio'));
    await builderWith(fakeBuild(false)).runNext();

    expect(await statusOf('u1')).toMatchObject({
      state: 'failed',
      failure: 'build-failed',
      log: 'building portfolio\nerror: something broke',
    });
    await expect(readFile(paths.current, 'utf8')).rejects.toThrow();
    await expect(readdir(join(paths.installed, 'portfolio'))).rejects.toThrow();
    await expect(readFile(paths.upload('u1').archive)).rejects.toThrow();
  });

  it("refuses the name of one of Kometio's own themes, without building", async () => {
    await queue('u1', themeFiles('classic'));
    const build = fakeBuild();
    await builderWith(build).runNext();

    expect(await statusOf('u1')).toMatchObject({
      name: 'classic',
      state: 'failed',
      failure: 'core-name',
    });
    expect(build).not.toHaveBeenCalled();
  });

  it('fails an archive it cannot use, with the reason, without building', async () => {
    await queue('u1', { 'theme.css': ':root{}' });
    const build = fakeBuild();
    await builderWith(build).runNext();

    expect(await statusOf('u1')).toMatchObject({
      state: 'failed',
      failure: 'no-manifest',
    });
    expect(build).not.toHaveBeenCalled();
  });

  it('builds the oldest upload first, one at a time', async () => {
    await queue('first', themeFiles('one'));
    await queue('second', themeFiles('two'));
    const build = fakeBuild();
    const builder = builderWith(build);

    await builder.runNext();
    expect((await statusOf('first')).state).toBe('published');
    expect((await statusOf('second')).state).toBe('queued');

    await builder.runNext();
    expect((await statusOf('second')).state).toBe('published');
    expect(await builder.runNext()).toBe(false);
  });

  it('builds every installed theme along with the new one, the new version replacing the old', async () => {
    const build = fakeBuild();
    const builder = builderWith(build);
    await queue('u1', themeFiles('one', ':root{--v:1}'));
    await builder.runNext();
    await queue('u2', themeFiles('two'));
    await builder.runNext();
    await queue('u3', themeFiles('one', ':root{--v:3}'));
    await builder.runNext();

    // The last build had both installed themes, `one` at its new version.
    expect(requested.at(-1)).toEqual({ one: ':root{--v:3}', two: ':root{}' });
    expect(
      await readFile(join(paths.installed, 'one', 'theme.css'), 'utf8'),
    ).toBe(':root{--v:3}');
  });

  it('keeps the build being served and the one before it, nothing older', async () => {
    const builder = builderWith(fakeBuild());
    for (const id of ['u1', 'u2', 'u3']) {
      await queue(id, themeFiles(`theme-${id}`));
      await builder.runNext();
    }

    expect((await readdir(paths.builds)).sort()).toEqual(['u2', 'u3']);
  });

  it('fails an upload it was building when it stopped', async () => {
    await queue('u1', themeFiles('portfolio'));
    const status = await statusOf('u1');
    await writeFile(
      paths.upload('u1').status,
      JSON.stringify({ ...status, state: 'building' }),
    );

    await builderWith(fakeBuild()).failInterrupted();

    expect(await statusOf('u1')).toMatchObject({
      state: 'failed',
      failure: 'interrupted',
    });
  });

  it('never leaves an upload saying "building" when something unexpected breaks', async () => {
    await queue('u1', themeFiles('portfolio'));
    // A build that says it built, and left nothing to publish.
    const build = vi.fn(async () => join(root, 'nowhere'));

    await expect(builderWith(build).runNext()).rejects.toThrow();

    expect(await statusOf('u1')).toMatchObject({
      state: 'failed',
      failure: 'build-failed',
    });
  });

  it('publishes the files a build wrote, never a link among them', async () => {
    await queue('u1', themeFiles('portfolio'));
    const build = vi.fn(async (request: BuildRequest, log: string) => {
      const dist = await fakeBuild()(request, log);
      if (dist) await symlink(paths.current, join(dist, 'server', 'current'));
      return dist;
    });

    await builderWith(build).runNext();

    expect((await statusOf('u1')).state).toBe('published');
    expect(
      (await readdir(join(paths.builds, 'u1', 'dist', 'server'))).sort(),
    ).toEqual(['entry.mjs']);
  });

  it('refuses a build whose compatibility stamp is a link, instead of reading where it points', async () => {
    await queue('u1', themeFiles('portfolio'));
    const secret = join(root, 'secret');
    await writeFile(secret, 'not for the public site');
    const build = vi.fn(async (request: BuildRequest, log: string) => {
      const dist = await fakeBuild()(request, log);
      if (dist) {
        await rm(join(dist, 'compatibility'));
        await symlink(secret, join(dist, 'compatibility'));
      }
      return dist;
    });

    await expect(builderWith(build).runNext()).rejects.toThrow(
      'compatibility is not a plain file',
    );

    expect(await statusOf('u1')).toMatchObject({
      state: 'failed',
      failure: 'build-failed',
    });
    await expect(readFile(paths.current, 'utf8')).rejects.toThrow();
  });
});
