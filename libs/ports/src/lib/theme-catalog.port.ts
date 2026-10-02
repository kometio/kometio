export interface AvailableTheme {
  /** Directory name under `themes/`, the same value `Site.themeName` stores and `KOMETIO_THEME` accepts. */
  name: string;
  /** Uploaded from the editor (docs/adr/0091) rather than shipped with Kometio. */
  uploaded: boolean;
}

/**
 * Which themes this deployment's public-site image actually has bundled
 * (docs/adr/0042) — read from the filesystem the image was built with, not a
 * static list, so it's always correct for whatever `KOMETIO_THEME` allow-list
 * subset a given build shipped. Used to validate `Site.themeName` writes and
 * to populate the theme picker in editor-app.
 */
export interface ThemeCatalogPort {
  listAvailableThemes(): Promise<AvailableTheme[]>;
}
