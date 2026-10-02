import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { applyThemeAllowList } from '@kometio/shared-types';
import type { AvailableTheme, ThemeCatalogPort } from '@kometio/ports';

export interface FilesystemThemeCatalogOptions {
  /**
   * Directory containing one subdirectory per theme, each with its own
   * `theme.json` — the repo's real `themes/` in local dev (nx serve's cwd
   * is the repo root), or a manifest-only copy baked into apps/api's own
   * image at build time in production, since the pruned runtime image
   * doesn't otherwise carry `themes/`'s Astro source (docs/adr/0042).
   */
  themesDir: string;
  /**
   * The raw `KOMETIO_THEME` value, when the deployment sets one — the same
   * comma-separated allow-list apps/public-site applies to what it will
   * render (docs/adr/0042).
   *
   * It has to be applied here too, and that is the whole reason this
   * option exists: this list populates the editor's theme picker, and a
   * picker offering a theme the public site refuses to render lets
   * somebody choose one and get the fallback instead, with no error
   * anywhere (ADR-0069).
   */
  allowList?: string | undefined;
  /**
   * The uploaded themes' manifests, `manifests/` on the theme volume
   * (docs/adr/0091) — absent where uploads are off. A theme appears here
   * once the builder has published a site built with it, so the editor
   * never offers one the public site cannot render.
   */
  uploadedThemesDir?: string | undefined;
}

/** Scans the filesystem fresh on every call — a deployment doesn't add or remove bundled themes without a rebuild, so there's nothing to cache. */
export class FilesystemThemeCatalogAdapter implements ThemeCatalogPort {
  constructor(private readonly options: FilesystemThemeCatalogOptions) {}

  async listAvailableThemes(): Promise<AvailableTheme[]> {
    const bundled = await this.themesIn(this.options.themesDir, false);
    const uploaded = this.options.uploadedThemesDir
      ? await this.themesIn(this.options.uploadedThemesDir, true)
      : [];
    // A bundled theme wins a name clash; the builder refuses to publish one
    // anyway, so this only guards a volume somebody edited by hand.
    const themes = [
      ...bundled,
      ...uploaded.filter(
        (theme) => !bundled.some((own) => own.name === theme.name),
      ),
    ];

    const allowed = applyThemeAllowList(
      themes.map((theme) => theme.name),
      this.options.allowList,
    );
    return themes
      .filter((theme) => allowed.includes(theme.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every directory under `directory` with a `theme.json` in it. */
  private async themesIn(
    directory: string,
    uploaded: boolean,
  ): Promise<AvailableTheme[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        // No uploaded theme yet means no manifests directory yet.
        if (uploaded && error.code === 'ENOENT') return [];
        throw error;
      },
    );
    const themes: AvailableTheme[] = [];

    for (const entry of entries) {
      // Symlinks count. `readdir` reports on the link itself, not its
      // target, so `isDirectory()` alone is false for a theme that lives
      // outside the repo and is linked into `themesDir` — which is exactly
      // how an agency's own theme reaches a deployment (docs/adr/0043).
      // Widening this is safe: the `access` below is what actually decides,
      // and only a directory can have a `theme.json` inside it.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const manifestPath = join(directory, entry.name, 'theme.json');
      const hasManifest = await access(manifestPath)
        .then(() => true)
        .catch(() => false);
      if (hasManifest) {
        themes.push({ name: entry.name, uploaded });
      }
    }
    return themes;
  }
}
