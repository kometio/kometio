import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  themeUploadStatusSchema,
  type ThemeUploadFailure,
  type ThemeUploadStatus,
} from '@kometio/shared-types';
import {
  ThemeArchiveError,
  extractThemeArchive,
  themeDataPaths,
  type PublishedBuild,
} from '@kometio/theme-archive';

/*
 * Turns an uploaded theme into a site the public site can run
 * (docs/adr/0091). A theme is compiled into the site, so every upload is a
 * build of the whole site, with every uploaded theme so far and this one.
 *
 * This is the trusted half, and it never runs a theme's code: building
 * does, so the build happens elsewhere (`build`: the runner container),
 * with nothing of this volume in reach. What comes back is copied in here,
 * and only then does the site see it. A build that fails leaves the site,
 * the installed themes and the editor's list exactly as they were.
 */

/** What a build is asked for: the site with every one of `themes` (name → source directory), for the upload of `name`. */
export interface BuildRequest {
  name: string;
  themes: ReadonlyMap<string, string>;
}

export interface ThemeBuilderOptions {
  /** The volume shared with the API and the public site. */
  dataDirectory: string;
  /** Kometio's own theme names, which an upload may not take. */
  coreThemes: readonly string[];
  /** The public site's node_modules, as its server sees them — what a published build runs on. */
  runtimeModules: string;
  /** Builds the site, writing its output to `log`: the built site's `dist`, or null when it did not build. */
  build: (request: BuildRequest, log: string) => Promise<string | null>;
  now?: () => Date;
}

/** Last lines of a failed build's log: what the editor shows. */
const LOG_TAIL_LINES = 40;

/** Terminal colour and cursor codes, which some tools print whatever they are told. */
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
  'g',
);

export class ThemeBuilder {
  private readonly paths;
  private readonly now: () => Date;

  constructor(private readonly options: ThemeBuilderOptions) {
    this.paths = themeDataPaths(options.dataDirectory);
    this.now = options.now ?? (() => new Date());
  }

  /** A build the builder was in the middle of when it stopped will never finish: say so. */
  async failInterrupted(): Promise<void> {
    for (const status of await this.statuses()) {
      if (status.state === 'building') {
        await this.update(status, {
          state: 'failed',
          failure: 'interrupted',
        });
      }
    }
  }

  /** Builds the oldest waiting upload, if there is one. Returns whether there was. */
  async runNext(): Promise<boolean> {
    const next = (await this.statuses())
      .filter((status) => status.state === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return false;
    await this.run(next);
    return true;
  }

  private async run(queued: ThemeUploadStatus): Promise<void> {
    const building = await this.update(queued, { state: 'building' });
    try {
      await this.attempt(building);
      await this.discardArchive(building.id);
    } catch (error) {
      await this.discardArchive(building.id);
      // Whatever went wrong, the upload must not say "building" forever.
      await this.update(building, {
        state: 'failed',
        failure: 'build-failed',
        log: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async attempt(building: ThemeUploadStatus): Promise<void> {
    const upload = this.paths.upload(building.id);
    let status = building;
    let name: string;
    try {
      await rm(upload.unpacked, { recursive: true, force: true });
      name = (await extractThemeArchive(upload.archive, upload.unpacked)).name;
    } catch (error) {
      if (error instanceof ThemeArchiveError) {
        await this.update(status, { state: 'failed', failure: error.problem });
        return;
      }
      throw error;
    }
    status = await this.update(status, { name });
    if (this.options.coreThemes.includes(name)) {
      await this.update(status, { state: 'failed', failure: 'core-name' });
      return;
    }

    // Every installed theme, and this one in place of any earlier version.
    const themes = new Map<string, string>();
    for (const installed of await this.installedThemes()) {
      themes.set(installed, join(this.paths.installed, installed));
    }
    themes.set(name, upload.unpacked);
    const dist = await this.options.build({ name, themes }, upload.log);
    if (!dist) {
      await this.update(status, {
        state: 'failed',
        failure: 'build-failed',
        log: await this.logTail(upload.log),
      });
      return;
    }

    await this.publish(building.id, name, upload.unpacked, dist);
    await this.update(status, { state: 'published' });
  }

  private async publish(
    build: string,
    name: string,
    unpacked: string,
    siteDist: string,
  ) {
    const buildDirectory = join(this.paths.builds, build);
    await rm(buildDirectory, { recursive: true, force: true });
    await mkdir(buildDirectory, { recursive: true });
    // Files only. The build ran a theme's code, so its output is the
    // theme's to shape — but a link in it could point anywhere on the
    // server that serves it.
    await cp(siteDist, join(buildDirectory, 'dist'), {
      recursive: true,
      filter: async (source) => !(await lstat(source)).isSymbolicLink(),
    });
    // The build brings its own compiled code, not its packages: it runs on
    // the public site's, which the site checks through `compatibility`.
    await symlink(
      this.options.runtimeModules,
      join(buildDirectory, 'node_modules'),
    );

    // Read before anything moves: both are written by, or next to, code the
    // theme ran, and each is read only as the plain file it claims to be.
    const compatibility = (
      await readPlainFile(join(siteDist, 'compatibility'))
    ).trim();
    const manifest = await readPlainFile(join(unpacked, 'theme.json'));

    await replaceDirectory(unpacked, join(this.paths.installed, name));
    await mkdir(join(this.paths.manifests, name), { recursive: true });
    await writeFile(join(this.paths.manifests, name, 'theme.json'), manifest);

    const previous = await this.currentBuild();
    const published: PublishedBuild = {
      build,
      compatibility,
      publishedAt: this.now().toISOString(),
    };
    await writeAtomically(this.paths.current, JSON.stringify(published));

    // The build before stays, so a site that has not switched yet still has
    // what it is serving; anything older is removed.
    for (const entry of await readdir(this.paths.builds)) {
      if (entry !== build && entry !== previous) {
        await rm(join(this.paths.builds, entry), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  /**
   * The zip, once its upload has an outcome: a published theme lives on in
   * `installed/`, a refused one is of no further use, and kept they only
   * fill the volume. The status and the log stay for the editor.
   */
  private async discardArchive(id: string): Promise<void> {
    const upload = this.paths.upload(id);
    await rm(upload.archive, { force: true });
    await rm(upload.unpacked, { recursive: true, force: true });
  }

  private async currentBuild(): Promise<string | null> {
    try {
      const current: unknown = JSON.parse(
        await readFile(this.paths.current, 'utf8'),
      );
      return typeof current === 'object' &&
        current !== null &&
        'build' in current &&
        typeof current.build === 'string'
        ? current.build
        : null;
    } catch {
      return null;
    }
  }

  private async installedThemes(): Promise<string[]> {
    return readdir(this.paths.installed).catch(() => []);
  }

  private async statuses(): Promise<ThemeUploadStatus[]> {
    const ids = await readdir(this.paths.uploads).catch(() => []);
    const found: ThemeUploadStatus[] = [];
    for (const id of ids) {
      const text = await readFile(this.paths.upload(id).status, 'utf8').catch(
        () => null,
      );
      if (text === null) continue;
      const parsed = themeUploadStatusSchema.safeParse(JSON.parse(text));
      if (parsed.success) found.push(parsed.data);
    }
    return found;
  }

  private async update(
    status: ThemeUploadStatus,
    change: Partial<
      Pick<ThemeUploadStatus, 'state' | 'name' | 'log'> & {
        failure: ThemeUploadFailure;
      }
    >,
  ): Promise<ThemeUploadStatus> {
    const next: ThemeUploadStatus = {
      ...status,
      ...change,
      updatedAt: this.now().toISOString(),
    };
    await writeAtomically(
      this.paths.upload(status.id).status,
      JSON.stringify(next),
    );
    return next;
  }

  private async logTail(log: string): Promise<string | null> {
    const text = await readFile(log, 'utf8').catch(() => null);
    return text === null
      ? null
      : text
          .replace(ANSI_ESCAPE, '')
          .trimEnd()
          .split('\n')
          .slice(-LOG_TAIL_LINES)
          .join('\n');
  }
}

async function replaceDirectory(source: string, target: string) {
  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

/** Written beside and renamed over: a reader sees the old file or the new one, never half of one. */
async function writeAtomically(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

/**
 * A file the build left, read only if it is a plain file. `compatibility`
 * is written by the theme's own build and was read where it lay, before
 * the copy that drops links: made a link, it had the builder read any
 * file it can reach and write it into what the public site loads (audit
 * B10).
 */
async function readPlainFile(path: string): Promise<string> {
  if (!(await lstat(path)).isFile()) {
    throw new Error(`${basename(path)} is not a plain file`);
  }
  return readFile(path, 'utf8');
}
