# filesystem-theme-catalog

`ThemeCatalogPort` implementation that scans a directory for one
subdirectory per theme, each with its own `theme.json` — see
[docs/adr/0042](../../../docs/adr/0042-self-hosting-distribution-and-runtime-theme-selection.md)
for why `Site.themeName` needs to be validated against, and the theme
picker populated from, whichever subset of themes a given deployment's
image actually bundled, instead of a static list.

## Implements

`ThemeCatalogPort` (`libs/ports/src/lib/theme-catalog.port.ts`) — a
single `listAvailableThemes()` method.

## Configuration

`themesDir` — where to scan. In local dev this is the repo's own
`themes/` (relative `./themes`, since `nx serve`'s cwd is the repo root,
same convention as `MEDIA_UPLOAD_DIR`). In production, `apps/api`'s
pruned runtime image doesn't otherwise carry `themes/`'s Astro source —
its `Dockerfile` copies just each theme's `theme.json` manifest,
preserving directory names, into `/app/themes/<name>/theme.json`, and
`THEMES_DIR` points there. Same scan logic either way.

## Used by

`apps/api` — wired by `createThemeCatalog()`
(`apps/api/src/app/themes/theme-catalog.factory.ts`), backing both
`Site.themeName` write validation and `GET /sites/themes/available`.

## Running unit tests

Run `nx test filesystem-theme-catalog` to execute the unit tests via [Vitest](https://vitest.dev/).
