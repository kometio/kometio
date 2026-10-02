# 0043 — Theme regions, and the surface a theme is built against

**Status**: Accepted — 2026-09-04

## Context

[ADR-0021](0021-site-theming-filesystem-packages-and-style-settings.md)
gave a theme three escalations over plain design tokens: override a
block's `.astro` file, add a block type of its own
([ADR-0041](0041-theme-defined-block-extensions.md)), or replace
`apps/public-site/src/layouts/PageLayout.astro` wholesale. The first two
were designed narrowly and held up. The third did not.

The strategic reason to revisit it: the highest-value thing left for this
product is making the path from _"here is my design"_ to _"here is a Kometio
theme"_ cheap. That path was blocked outright, because **a theme could not
live outside this monorepo** — and investigating why produced a single
culprit rather than the expected packaging problem.

Measured on `themes/docs-showcase`, the only theme that used the full-shell
override:

|                                              |                                                    |
| -------------------------------------------- | -------------------------------------------------- |
| Copy of the shell                            | **581 lines**, against core's 409                  |
| Imports reaching into `apps/public-site/**`  | **13**, of which **11 were copied infrastructure** |
| Imports the block overrides genuinely needed | **3**                                              |
| Imports the new block type (ADR-0041) needed | **0**                                              |

So the block mechanism was already right. Only the shell was coupled, and
the copy was not a theoretical cost — it had already produced four real,
silent defects, every one verified on a build:

1. **CSS leaked between themes.** The override glob is eager, so every
   theme's CSS entered _every_ page's stylesheet. A page served with
   `themeName='classic'` linked an 18KB file carrying docs-showcase's
   entire dark palette as a flat `:root` rule, plus its `is:global`
   `body{display:flex;min-height:100vh}`. The only thing keeping a classic
   site from turning dark was the `!important` on ADR-0042's inline token
   injection — one layer of `!important` between two themes.
2. **The skip-to-content link was lost** (WCAG 2.4.1).
3. **`data-kometio-root-blocks` was lost on header and footer**, so
   inserting a block there from the visual editor was simply broken on
   that theme — `preview-bridge-client.ts` looks for those attributes.
4. **Silent drift**: the copy never received ADR-0042's token injection.

None were caught, because a theme's `.astro` code was covered by nothing:
each theme's `tsconfig.lib.json` included only `blocks/**/*.ts`, the app's
`astro check` never entered `themes/`, and eslint does not lint `.astro`.
The proof was a live arity bug —
`themes/docs-showcase/blocks/LanguageSwitcher.astro` called
`resolveIconSvg('globe')` with one argument against a two-argument
signature — introduced by ADR-0042 and invisible because neither theme
shipped an `icons/` directory.

## Decision

**A theme supplies fragments, never the shell.** Three optional files —
`themes/<name>/regions/{Header,ContentShell,Footer}.astro` — each replacing
only the element that _wraps_ a part of the page. Core keeps `<html>`,
`<head>`, `<body>`, the skip link, `data-kometio-root-blocks`, block
rendering, CSP, consent, schema.org and the preview bridge, and passes the
already-rendered blocks to the region as a slot. The four defects above
become unrepresentable rather than fixed. `resolve-theme-layout-override.ts`
is removed, not deprecated.

There are three regions and not one because a theme must be able to change
the _look_ of the header and footer, not only their contents. It already
governed the blocks inside them (overridable) and their colours (tokens),
but not the container — which it could only reach with `is:global`, which
is precisely how the leak happened.

**Region props are minimal and deliberately not `PublishedSite`.** That
type would drag `headScript`, `trackerScripts` and `cookieBannerSettings`
along with it — an invitation to reimplement the infrastructure this
change removes. Regions get `locale`, `currentPath`, `i18n`, `editable`, a
`route` discriminator, and a **lazy accessor** for the page tree. That
accessor is the best part of the contract: core owns the fetch, the
per-request memoization (pages are published between requests, so
per-process would be wrong), the domain guard and the error policy. All of
that used to be the theme's code — which is exactly what a copy gets wrong.

**Regions never render on the 500 page.** That page is the last error
handler and a throw there has nowhere to propagate; Astro cannot try/catch
a component's render from the frontmatter. One prop removes an entire class
of failure.

**A theme is built against packages, not paths.** `@kometio/theme-runtime`
(new, zero dependencies) carries the locale-path helpers, the `Translator`
and its two dictionaries, the region props and `PageTreeNodeDto`.
`CORE_BLOCK_TYPES` moves into `@kometio/block-sdk` so a theme's own collision
check no longer drags in `@kometio/block-registry`, which is React and editor
UI. Both core themes now import from `apps/public-site` **zero** times.

**The icon registry stays in the app and is injected.** It cannot be a
package: it is an eager glob over every theme's `icons/` plus
`lucide-static` resolved through `import.meta.resolve`. Two paths, split by
who chose the icon — core resolves an editor user's choice and passes it
down as `iconSvg`; a theme wanting an icon of its own calls
`Astro.locals.resolveIcon(name, themeName)`, typed by
`@kometio/theme-runtime/locals` and filled in by middleware.

**Fonts are self-hosted, never from a CDN.** A theme declares a `fonts.css`
importing a font package it depends on. A `<link>` to Google Fonts would
send every visitor's IP to a third party — a German court ruled on exactly
that in 2022 — which is untenable for a product selling "your data stays on
your own machine" that also generates the customer's privacy policy, and it
breaks intranet deployments outright.

**`stickyFooter` is a manifest flag, not theme CSS**, because it targets
`<body>`, which core owns. A theme could only reach it with `is:global`.

## Consequences

The measured result, on a real build: a page rendered with `classic` no
longer links any stylesheet containing `#0b0f14` or `#5b9bd5`. What remains
of docs-showcase in the shared sheet is scoped to a cid that appears **zero
times** in that page's DOM — it cannot match, rather than being unlikely to.
`docs-showcase` went from 581 lines to 242, and from 13 app imports to
none.

A theme's `.astro` files are now type-checked. Each theme takes `astro` as
a devDependency (pnpm symlinks it, nothing is downloaded) plus a
`tsconfig.astro.json` and a one-line `env.d.ts`; `astro check --tsconfig`
lets that coexist with the `nx sync`-managed tsconfig. This found three
real defects on its first run, all of the same family — theme code copied
from core that then diverged in silence.

The remaining costs, accepted knowingly:

- **Every bundled theme's region CSS and `fonts.css` still enter the shared
  stylesheet** (~1–2KB per theme), because `import.meta.glob` needs a
  static literal pattern and Astro's `getParentModuleInfos` walks
  `dynamicImporters`, so a lazy glob would not remove them either. They are
  inert by construction: scoped selectors that match nothing, and an
  `@font-face` no rule references downloads nothing.
- **A region that forgets `<slot />` makes the whole page vanish**, with
  nothing to warn you. Documented loudly in `themes/README.md`; there is no
  mechanism that could catch it.
- **Core still carries one theme's vocabulary** — docs-showcase's `docs.*`
  and `docsPagination.*` keys live in `@kometio/theme-runtime`'s
  dictionaries. The fix is `themes/<name>/locales/<lang>.json`, following
  the precedent `blocks/*.locales.json` set in ADR-0041, deferred until a
  second theme wants strings of its own.
- **`CORE_BLOCK_TYPES` is a literal list**, since block-sdk must not depend
  on block-registry. Drift is not left to discipline:
  `libs/block-registry/src/lib/core-block-types.spec.ts` asserts the two
  match and fails naming exactly what to add or remove.

Finally, this was verified where it counts. A theme authored entirely
outside the monorepo renders — its region, its scoped CSS, its tokens —
from a real Docker image running as a real container. **No entry mechanism
had to be built.** The three candidates weighed on paper (a build-time
copy, an npm package reached with `import.meta.glob`'s `exhaustive: true`,
a Vite alias onto an `external-themes/` directory) all turned out to be
unnecessary: the existing globs already accept any directory sitting at
`themes/<name>/`, symlinks included, once the imports resolve by package
name instead of by relative path — which is what the rest of this ADR did.

So the mechanism is just "the directory is there": symlink it in
development, and have it be a real directory in the Docker build context,
because `COPY` preserves a symlink as a symlink and the link then dangles
inside the image (measured with an isolated build, not assumed). A theme
that only needs to render requires no `package.json`, no `tsconfig`, no Nx
wiring at all — that scaffolding exists to give a theme in _this_ repo its
own CI targets.

Trying it also found a real defect the design work had not: the API's
theme catalog filtered directory entries with `isDirectory()`, which is
false for a symlink, since `readdir` reports on the link rather than its
target. An external theme therefore rendered correctly but never appeared
in the editor's theme picker, and `PATCH /sites/:id/theme-package`
rejected its name. Fixed, with a regression test that symlinks a theme in
from outside the scanned directory.
