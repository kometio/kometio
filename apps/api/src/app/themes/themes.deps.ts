import type { ThemeCatalogPort, ThemeUploadPort } from '@kometio/ports';

/** What the themes module's use cases are built from (see moduleDeps). */
export interface ThemesDeps {
  themeUploads: ThemeUploadPort | null;
  themeCatalog: ThemeCatalogPort;
}
