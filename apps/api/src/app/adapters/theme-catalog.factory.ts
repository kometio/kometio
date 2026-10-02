import { join } from 'node:path';
import { FilesystemThemeCatalogAdapter } from '@kometio/filesystem-theme-catalog';
import type { ThemeCatalogPort } from '@kometio/ports';
import type { ApiEnv } from '../../env-schema';

/**
 * THEMES_DIR: `./themes` (the repo's own themes/ directory, since nx
 * serve's cwd is the repo root) in local dev; `/app/themes` in production,
 * where the Dockerfile copies just each theme's theme.json manifest
 * (docs/adr/0042 — the pruned runtime image doesn't otherwise carry
 * themes/'s Astro source).
 */
export function createThemeCatalog(env: ApiEnv): ThemeCatalogPort {
  return new FilesystemThemeCatalogAdapter({
    themesDir: env.THEMES_DIR,
    // Unset, every bundled theme is offered.
    allowList: env.KOMETIO_THEME,
    // Uploaded themes (docs/adr/0091), when the deployment has the volume.
    uploadedThemesDir: env.THEME_DATA_DIR
      ? join(env.THEME_DATA_DIR, 'manifests')
      : undefined,
  });
}
