import type {
  ThemeUploadFailure,
  ThemeUploadStatus,
} from '@kometio/shared-types';

/** What reading an uploaded archive found: the theme's name, or why it cannot be used. */
export type InspectedThemeArchive =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly failure: ThemeUploadFailure };

/**
 * Uploaded themes on their way to the site (docs/adr/0091). The API reads
 * an archive and queues it; a separate builder does the rest, and this is
 * how the API sees where it has got to.
 */
export interface ThemeUploadPort {
  /** Reads an archive without writing anything. */
  inspect(archivePath: string): Promise<InspectedThemeArchive>;
  /** Takes the archive over — the caller's file is gone afterwards — and queues it for the builder. */
  enqueue(archivePath: string, name: string): Promise<ThemeUploadStatus>;
  status(id: string): Promise<ThemeUploadStatus | null>;
}
