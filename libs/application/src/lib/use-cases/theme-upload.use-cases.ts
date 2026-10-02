import {
  ThemeUploadNotFoundError,
  ThemeUploadRejectedError,
} from '@kometio/domain-core';
import type { ThemeCatalogPort, ThemeUploadPort } from '@kometio/ports';
import type { ThemeUploadStatus } from '@kometio/shared-types';

export interface ThemeUploadDeps {
  themeUploads: ThemeUploadPort;
  themeCatalog: ThemeCatalogPort;
}

/**
 * Takes an uploaded theme and queues it for the builder (docs/adr/0091).
 *
 * Everything that can be known from the archive alone is refused here, so
 * the editor hears it the moment the file arrives instead of after the
 * builder picks it up — the builder checks again, being the one that
 * writes. A theme named like one of Kometio's own would replace it for every
 * site that uses it.
 */
export async function uploadTheme(
  deps: ThemeUploadDeps,
  input: { archivePath: string },
): Promise<ThemeUploadStatus> {
  const inspected = await deps.themeUploads.inspect(input.archivePath);
  if (!inspected.ok) {
    throw new ThemeUploadRejectedError(inspected.failure);
  }
  const themes = await deps.themeCatalog.listAvailableThemes();
  if (
    themes.some((theme) => !theme.uploaded && theme.name === inspected.name)
  ) {
    throw new ThemeUploadRejectedError('core-name');
  }
  return deps.themeUploads.enqueue(input.archivePath, inspected.name);
}

export async function getThemeUpload(
  deps: Pick<ThemeUploadDeps, 'themeUploads'>,
  input: { id: string },
): Promise<ThemeUploadStatus> {
  const status = await deps.themeUploads.status(input.id);
  if (!status) throw new ThemeUploadNotFoundError(input.id);
  return status;
}
