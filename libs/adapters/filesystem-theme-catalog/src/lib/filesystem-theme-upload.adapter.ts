import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import type { InspectedThemeArchive, ThemeUploadPort } from '@kometio/ports';
import {
  themeUploadStatusSchema,
  type ThemeUploadStatus,
} from '@kometio/shared-types';
import {
  ThemeArchiveError,
  inspectThemeArchive,
  themeDataPaths,
} from '@kometio/theme-archive';

/** An upload's id: the only thing from a request that ever becomes part of a path here. */
const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Uploaded themes on the volume the theme builder watches (docs/adr/0091).
 * This side only reads archives, queues them and reads their status; the
 * builder writes every status after the first.
 */
export class FilesystemThemeUploadAdapter implements ThemeUploadPort {
  private readonly paths;

  constructor(
    dataDirectory: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.paths = themeDataPaths(dataDirectory);
  }

  async inspect(archivePath: string): Promise<InspectedThemeArchive> {
    try {
      const archive = await inspectThemeArchive(archivePath);
      return { ok: true, name: archive.name };
    } catch (error) {
      if (error instanceof ThemeArchiveError) {
        return { ok: false, failure: error.problem };
      }
      throw error;
    }
  }

  async enqueue(archivePath: string, name: string): Promise<ThemeUploadStatus> {
    const id = randomUUID();
    const upload = this.paths.upload(id);
    await mkdir(upload.directory, { recursive: true });
    // Copied, then removed: the upload arrives in a temporary directory,
    // and a volume is another filesystem, across which `rename` fails.
    await copyFile(archivePath, upload.archive);
    await unlink(archivePath);
    const at = this.now().toISOString();
    const status: ThemeUploadStatus = {
      id,
      name,
      state: 'queued',
      failure: null,
      log: null,
      createdAt: at,
      updatedAt: at,
    };
    // The status last and whole: the builder picks up an upload by its
    // status, so the archive has to be complete before one appears.
    const temporary = `${upload.status}.tmp`;
    await writeFile(temporary, JSON.stringify(status));
    await rename(temporary, upload.status);
    return status;
  }

  async status(id: string): Promise<ThemeUploadStatus | null> {
    if (!UPLOAD_ID.test(id)) return null;
    const text = await readFile(this.paths.upload(id).status, 'utf8').catch(
      () => null,
    );
    if (text === null) return null;
    const parsed = themeUploadStatusSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  }
}
