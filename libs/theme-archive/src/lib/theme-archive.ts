import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { ThemeUploadFailure } from '@kometio/shared-types';

/*
 * A theme uploaded from the editor, as a zip (docs/adr/0091).
 *
 * Read twice: by the API when the file arrives, so the editor hears at once
 * what is wrong with it, and by the theme builder before it writes a byte,
 * because the builder is the one that puts files on disk and has to trust
 * nothing it did not check itself. Same rules both times, from this one
 * place.
 */

/** How large a theme may be, compressed and unpacked. A theme is tokens, a few components and its fonts; these are several times any real one. */
export const THEME_ARCHIVE_LIMITS = {
  archiveBytes: 20 * 1024 * 1024,
  entries: 1000,
  unpackedBytes: 80 * 1024 * 1024,
  manifestBytes: 64 * 1024,
} as const;

/** What an uploaded theme's files may be: components, code, styles, data, fonts and pictures. */
const THEME_FILE_EXTENSIONS = new Set([
  '.astro',
  '.ts',
  '.mts',
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.ico',
  '.md',
  '.txt',
]);

/** Files a font or a licence ships under without an extension. */
const BARE_NAMES = new Set(['LICENSE', 'LICENCE', 'NOTICE', 'OFL', 'COPYING']);

/** What a site chooses the theme by, and the directory it builds under. */
export const THEME_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** What is wrong with an archive — every upload failure except those after it is accepted. */
export type ThemeArchiveProblem = Exclude<
  ThemeUploadFailure,
  'core-name' | 'build-failed' | 'interrupted'
>;

/** Why an archive is refused — `problem` for the editor to say it in its own language, `message` for a log. */
export class ThemeArchiveError extends Error {
  constructor(
    readonly problem: ThemeArchiveProblem,
    message: string,
  ) {
    super(message);
    this.name = 'ThemeArchiveError';
  }
}

export interface ThemeArchive {
  /** From `theme.json`'s `name`. */
  name: string;
  manifest: Readonly<Record<string, unknown>>;
  /** The theme's files, relative to its root, as they will be written. */
  files: readonly string[];
  /** Files left out: a repository's own furniture (.git, .github, a Dockerfile), not the theme. */
  skipped: readonly string[];
}

interface ListedEntry {
  /** The path inside the archive. */
  archivePath: string;
  size: number;
}

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((done, fail) => {
    yauzl.open(
      zipPath,
      // Entries one at a time; sizes checked against what the stream
      // actually produces, which is what stops a header that lies.
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => (error ? fail(asArchiveError(error)) : done(zip)),
    );
  });
}

function openEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((done, fail) => {
    zip.openReadStream(entry, (error, stream) =>
      error ? fail(error) : done(stream),
    );
  });
}

/** yauzl refuses an absolute path, a `..` and a backslash itself, with an error saying so. */
function asArchiveError(error: unknown): ThemeArchiveError {
  if (error instanceof ThemeArchiveError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return /file ?name|relative path|absolute path/i.test(message)
    ? new ThemeArchiveError('unsafe-path', message)
    : new ThemeArchiveError('not-a-zip', message);
}

/** Whether an entry is a symbolic link: the file type in the high bits of the attributes a Unix zipper writes. */
function isLink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

function isSkipped(path: string): boolean {
  const segments = path.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  if (
    segments.some(
      (segment) =>
        segment.startsWith('.') ||
        segment === '__MACOSX' ||
        segment === 'node_modules',
    )
  ) {
    return true;
  }
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return !BARE_NAMES.has(fileName.toUpperCase());
  return !THEME_FILE_EXTENSIONS.has(fileName.slice(dot).toLowerCase());
}

/** Every file entry, refused outright if any entry is unsafe or the whole is too big. */
async function listEntries(zipPath: string): Promise<ListedEntry[]> {
  const zip = await openZip(zipPath);
  const entries: ListedEntry[] = [];
  let unpacked = 0;
  try {
    await new Promise<void>((done, fail) => {
      zip.on('error', fail);
      zip.on('end', done);
      zip.on('entry', (entry: Entry) => {
        try {
          if (zip.entryCount > THEME_ARCHIVE_LIMITS.entries) {
            throw new ThemeArchiveError(
              'too-many-entries',
              `The archive holds ${zip.entryCount} entries; a theme may have ${THEME_ARCHIVE_LIMITS.entries}.`,
            );
          }
          if (entry.isEncrypted()) {
            throw new ThemeArchiveError(
              'encrypted',
              `${entry.fileName} is encrypted.`,
            );
          }
          if (isLink(entry)) {
            throw new ThemeArchiveError(
              'link',
              `${entry.fileName} is a link; a theme holds files only.`,
            );
          }
          if (!entry.fileName.endsWith('/')) {
            unpacked += entry.uncompressedSize;
            if (unpacked > THEME_ARCHIVE_LIMITS.unpackedBytes) {
              throw new ThemeArchiveError(
                'too-large',
                `The archive unpacks to more than ${THEME_ARCHIVE_LIMITS.unpackedBytes} bytes.`,
              );
            }
            entries.push({
              archivePath: entry.fileName,
              size: entry.uncompressedSize,
            });
          }
          zip.readEntry();
        } catch (error) {
          fail(error);
        }
      });
      zip.readEntry();
    });
  } catch (error) {
    throw asArchiveError(error);
  } finally {
    zip.close();
  }
  return entries;
}

/**
 * The folder every file sits in, when there is exactly one — GitHub's
 * "Download ZIP" puts a whole repository under `<repo>-<branch>/`. Empty
 * when the theme's files are at the top of the archive.
 */
function commonRoot(entries: readonly ListedEntry[]): string {
  const tops = new Set(entries.map((entry) => entry.archivePath.split('/')[0]));
  const [only] = tops;
  return tops.size === 1 &&
    only !== undefined &&
    entries.every((entry) => entry.archivePath.includes('/'))
    ? `${only}/`
    : '';
}

async function readManifest(
  zipPath: string,
  archivePath: string,
): Promise<Record<string, unknown>> {
  const zip = await openZip(zipPath);
  try {
    const text = await new Promise<string>((done, fail) => {
      zip.on('error', fail);
      zip.on('end', () =>
        fail(new ThemeArchiveError('no-manifest', 'theme.json is missing.')),
      );
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName !== archivePath) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > THEME_ARCHIVE_LIMITS.manifestBytes) {
          fail(
            new ThemeArchiveError('bad-manifest', 'theme.json is too large.'),
          );
          return;
        }
        openEntry(zip, entry)
          .then(async (stream) => {
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
            done(Buffer.concat(chunks).toString('utf8'));
          })
          .catch(fail);
      });
      zip.readEntry();
    });
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new ThemeArchiveError(
        'bad-manifest',
        'theme.json is not a JSON object.',
      );
    }
    return Object.fromEntries(Object.entries(parsed));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ThemeArchiveError(
        'bad-manifest',
        `theme.json is not valid JSON: ${error.message}`,
      );
    }
    throw asArchiveError(error);
  } finally {
    zip.close();
  }
}

/** Checks an archive without writing anything: what the API does the moment a file arrives. */
export async function inspectThemeArchive(
  zipPath: string,
): Promise<ThemeArchive> {
  const entries = await listEntries(zipPath);
  const root = commonRoot(entries);
  const kept: string[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    const path = entry.archivePath.slice(root.length);
    (isSkipped(path) ? skipped : kept).push(path);
  }
  if (!kept.includes('theme.json')) {
    throw new ThemeArchiveError(
      'no-manifest',
      'theme.json is missing from the top of the theme.',
    );
  }
  if (!kept.includes('theme.css')) {
    throw new ThemeArchiveError(
      'no-stylesheet',
      'theme.css is missing from the top of the theme.',
    );
  }
  const manifest = await readManifest(zipPath, `${root}theme.json`);
  const name = manifest['name'];
  if (typeof name !== 'string' || !THEME_NAME_PATTERN.test(name)) {
    throw new ThemeArchiveError(
      'bad-name',
      'theme.json needs a "name": lowercase letters, digits and dashes, up to 40 characters.',
    );
  }
  return { name, manifest, files: kept, skipped };
}

/**
 * Writes the theme's files under `destination`, checking the archive again
 * first: this is the step that touches the disk. Every path is resolved
 * and must stay inside `destination` — a second guard behind yauzl's own.
 */
export async function extractThemeArchive(
  zipPath: string,
  destination: string,
): Promise<ThemeArchive> {
  const archive = await inspectThemeArchive(zipPath);
  const entries = await listEntries(zipPath);
  const root = commonRoot(entries);
  const wanted = new Set(archive.files.map((path) => `${root}${path}`));
  const base = resolve(destination);
  const zip = await openZip(zipPath);
  try {
    await new Promise<void>((done, fail) => {
      zip.on('error', fail);
      zip.on('end', done);
      zip.on('entry', (entry: Entry) => {
        if (!wanted.has(entry.fileName)) {
          zip.readEntry();
          return;
        }
        const target = resolve(base, entry.fileName.slice(root.length));
        if (!target.startsWith(`${base}${sep}`)) {
          fail(
            new ThemeArchiveError(
              'unsafe-path',
              `${entry.fileName} would be written outside the theme.`,
            ),
          );
          return;
        }
        mkdir(dirname(target), { recursive: true })
          .then(() => openEntry(zip, entry))
          .then((stream) => pipeline(stream, createWriteStream(target)))
          .then(() => zip.readEntry())
          .catch(fail);
      });
      zip.readEntry();
    });
  } catch (error) {
    throw asArchiveError(error);
  } finally {
    zip.close();
  }
  return archive;
}
