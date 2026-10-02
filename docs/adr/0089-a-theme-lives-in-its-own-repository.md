# 0089 — A theme lives in its own repository, and is built on a published builder image

**Status**: Accepted — 2026-09-26

## Context

The public site finds its themes with `import.meta.glob('themes/*/…')`
(theme-registry.ts and the resolvers beside it), so a theme exists only if
it sits in this repository when the site is built. An agency could not keep
its theme in its own repository: there was nowhere for "bring your own
design" to land. Three smaller facts stood in the way too:

- A theme's own words had nowhere to go. docs-showcase's sidebar and pager
  labels lived in `@kometio/theme-runtime`'s dictionary — core's — which a
  theme outside this repository cannot edit.
- docs-showcase declared its own `zod` and a font package. A theme with
  dependencies of its own needs them installed at build and present at run
  time, and a second copy of zod is a second validator.
- Nothing stopped a theme from taking the name of one of Kometio's own and
  replacing it for every site.

## Decision

- **A builder image.** `apps/public-site/Dockerfile`'s `builder` stage — the
  workspace with its dependencies installed, nothing built — is published as
  `kometio-public-site-builder`, with the same tags as `kometio-public-site`. The
  theme's repository holds a three-stage Dockerfile (docs/creating-a-theme.md,
  "Shipping it"): copy the theme to `themes/<name>/` in the builder and run
  `tools/build-public-site-with-theme.mjs`, put the resulting `dist` in
  Kometio's public-site image, and add the theme's `theme.json` to Kometio's API
  image so the editor offers it.
- **The theme installs nothing.** The script links the public site's own
  packages into `themes/node_modules`, where a theme's imports resolve. So a
  theme can import exactly what the running site carries — no network, no
  lockfile change, no import that works at build and fails at run. A
  `package.json` asking for more is refused with the list of what is
  available.
- **Fonts are files of the theme** (`fonts/` and `@font-face` in
  `fonts.css`), docs-showcase included; npm font packages were only a way
  to download those files.
- **A theme's words are its own.** A `locales.json` beside `theme.json`, read
  with `DictionaryTranslator` from `@kometio/theme-runtime` (core's
  `Translator` is now that class with core's dictionary). docs-showcase's
  four strings moved out of core.
- **`z` comes from `@kometio/block-sdk`.** A theme block's schema is written
  with core's zod; themes declare no zod of their own.
- **Kometio's own theme names are reserved.** The builder records them
  (`.kometio-core-themes`) and the script refuses a theme that takes one.

Not npm packages, for now. Publishing `block-sdk`, `theme-runtime` and
`shared-types` would give a theme types and autocompletion anywhere and a
semver contract, but it needs a frozen public API, npm names and a decision
on which modules the licence keeps closed — all open. The theme directory
is the same either way, so that step can come later without redoing this
one.

## Consequences

- A theme cannot bring npm dependencies of its own. What it needs beyond
  Kometio's packages it carries as files.
- Types and `astro check` for a theme kept elsewhere come from building it
  in a Kometio checkout (docs/creating-a-theme.md, "Developing it outside this
  repo") or in the builder image, not from its own repository alone.
- The builder image is large (the whole workspace, installed). It is a
  build-time image only; nothing runs from it.
- Uploading a theme from the editor (backlog item 18) builds on this: the
  same builder, the same script, run by a job instead of by hand.
