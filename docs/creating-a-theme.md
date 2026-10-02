# Creating a Kometio theme

This is the practical guide: what you actually do, today, to turn a design
into a Kometio theme. For the reference — every file, every field, every
prop — see [themes/README.md](../themes/README.md). For why the design is
shaped this way, see [ADR-0021](adr/0021-site-theming-filesystem-packages-and-style-settings.md)
and [ADR-0043](adr/0043-theme-regions-and-the-publishable-theme-surface.md).

The short version: **a theme is a directory**. It does not have to live in
this repository, it does not need a `package.json`, and it can be as small
as two files.

## The escalation ladder

Reach for the lowest rung that gets you there. Each step up costs
something — more surface to keep working when Kometio changes — so most
themes should stop at the first one.

|     | You want to change                     | You write                                             |
| --- | -------------------------------------- | ----------------------------------------------------- |
| 1   | Colours, fonts, spacing, corners       | `theme.css` — design tokens                           |
| 2   | One block's markup                     | `blocks/<Name>.astro`                                 |
| 3   | The header, footer, or content wrapper | `regions/<Name>.astro`                                |
| 4   | Add a block type Kometio doesn't have  | `blocks/<Type>.block.ts` + `.astro` + `.locales.json` |

There is deliberately **no rung for "replace the whole page"**. There used
to be, and it was removed in ADR-0043 — the one theme that used it had to
copy 581 lines of page shell to change the one in the middle, and that copy
silently shipped four real defects. If a region cannot express what your
design needs, the contract gets extended; don't reach for `is:global` to
work around it.

## The smallest theme that works

Two files:

```
my-theme/
  theme.json    { "name": "my-theme", "allowStyleOverrides": true }
  theme.css     :root { --primary: …; --background: …; --font-sans-value: …; }
```

Copy `themes/classic/theme.css` and rewrite the values. Every one of
Kometio's hundred-odd blocks is built on those tokens, the way shadcn/ui components
are — one implementation, restyled through custom properties, never
duplicated per theme.

Two tokens are easy to get wrong:

- **`--font-sans-value`**, not `--font-sans`. The indirection is what lets
  a site owner's own font picker override your default later. Set
  `--font-sans` directly and that picker silently stops working for your
  theme.
- Every colour token in the list `themes/README.md` gives. A missing one
  falls back to core's neutral default, which usually looks like a bug
  rather than a choice.

## Developing it outside this repo

Keep the theme in its own repository and copy it into a Kometio checkout while
you work on it — copy, not symlink, so the build sees it the way the
builder image will:

```sh
rsync -a --delete --exclude node_modules /path/to/my-theme/ themes/my-theme/
node tools/build-public-site-with-theme.mjs my-theme
node --env-file=.env apps/public-site/server.mjs
```

The script checks the theme, links the public site's own packages where the
theme's imports look for them, and builds. Then pick the theme in the
editor's Style dialog ("Tema"), which writes `Site.themeName`. Switching
between themes after that needs nothing but a page reload.

A new theme is only picked up by a build: the site reads `themes/*` once,
when it is built, not on a file save.

## Adding a webfont

Bring the font as files of the theme and declare it in a `fonts.css`:

```
my-theme/
  fonts.css
  fonts/
    sora-latin-wght-normal.woff2
    OFL.txt
```

```css
/* my-theme/fonts.css */
@font-face {
  font-family: 'Sora Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 800;
  src: url(./fonts/sora-latin-wght-normal.woff2) format('woff2-variations');
}
```

Files, not an npm package: a theme cannot install packages of its own (see
"What you import"). A package such as `@fontsource-variable/sora` is only a
way to download those same files — copy its `.woff2` and `@font-face` rules
out of it. `themes/docs-showcase/fonts.css` is a worked example.

Then point `--font-sans-value` at it — **using the family name the
`@font-face` declares, exactly**. A near-miss (`Sora` for `Sora Variable`)
fails silently, falling through to the next entry in your stack while the
font you bundled never loads.

**Never `<link>` to Google Fonts or any CDN.** It sends every visitor's IP
address to a third party — a German court ruled on exactly that in 2022 —
which is untenable for a product that sells "your data stays on your own
machine" and generates the customer's privacy policy for them; it also
breaks intranet deployments outright. Keep the font's licence file next to
it, and check you have redistribution rights: Google Fonts are OFL/Apache,
a commercial licence usually is not.

## Changing the page's furniture

Three optional files let you replace the element that _wraps_ part of the
page, without touching the page itself:

```astro
---
// my-theme/regions/Header.astro
import type { ThemeHeaderProps } from '@kometio/theme-runtime';
export type Props = ThemeHeaderProps;
const { sticky, class: className } = Astro.props;
---
<header class:list={['my-header', className, { 'my-header--sticky': sticky }]}>
  <slot />
</header>
```

You receive the already-rendered blocks as a slot and decide only the
wrapper. Core keeps `<html>`, `<head>`, `<body>`, the skip-to-content link,
the editor's `data-kometio-root-blocks` hooks, block rendering, CSP, cookie
consent, schema.org and the preview bridge — none of which a theme can
break.

**A region that forgets `<slot />` makes the entire page vanish, silently.**
Nothing warns you. It is the first thing to check if a page comes back
blank.

## What you import

Everything comes from Kometio's packages, never from a relative path into
`apps/public-site`, and **nothing else**: a theme is built with the
packages the public site itself ships, so it cannot import one the running
site would not have. The build refuses a theme whose `package.json` lists
anything more.

- `@kometio/theme-runtime` — the region props, `localePath`, the
  `DictionaryTranslator` for your own strings
- `@kometio/shared-types` — every block's props type
- `@kometio/block-sdk` — `defineBlock`, field types, `CORE_BLOCK_TYPES`, and
  `z` for a block schema of your own (core's zod — never add zod yourself)

Words your theme puts on the page (a sidebar's label, a pager's "Next")
go in a `locales.json` next to `theme.json`, one object per language:

```json
{
  "en": { "next": "Next", "previous": "Previous" },
  "it": { "next": "Successiva", "previous": "Precedente" }
}
```

```astro
---
import { DictionaryTranslator } from '@kometio/theme-runtime';
import strings from '../locales.json';
const t = new DictionaryTranslator(Astro.props.locale, strings);
---
<a rel="next">{t.t('next')}</a>
```

A language the file does not have falls back to Italian, then English.
Core's own dictionary (the `i18n` a region receives) is for core's words;
a theme's never go there.

Your `env.d.ts` needs exactly two lines:

```ts
/// <reference types="astro/client" />
/// <reference types="@kometio/theme-runtime/locals" />
```

The second one types `Astro.locals`, which is how you draw an icon your
theme wants (`Astro.locals.resolveIcon('globe', site.themeName)`). For an
icon the _editor's user_ picked on a block that has an icon field, don't
call that — core already resolved it and hands it to your override as
`iconSvg`.

## Shipping it

The simplest way is to upload it: in the editor, Style → Theme → "Upload
a theme", with the theme as a zip — its repository downloaded as a zip
works as it comes. The stack builds the site with it by itself, and the
editor offers "Use it for this site" when it is ready (a minute or two).
`theme.json` needs a `name` for that: lowercase letters, digits and
dashes, and not one of Kometio's own. Only admins can upload, and a
deployment can turn uploads off ([self-hosting.md](self-hosting.md),
"Uploaded themes"; the why is ADR-0091).

To ship it as images instead — to install it on many sites, or pin it to
a Kometio version — build it on Kometio's
`kometio-public-site-builder`: the public site's workspace, installed and not
yet built. Put this `Dockerfile` in the theme's repository, next to
`theme.json`:

```dockerfile
# syntax=docker/dockerfile:1
# One tag for all three images: a theme is built on one and runs on the
# others, and they have to be the same Kometio.
ARG KOMETIO=ghcr.io/kometio
ARG KOMETIO_TAG=main

FROM ${KOMETIO}/kometio-public-site-builder:${KOMETIO_TAG} AS build
COPY . themes/my-theme
RUN node tools/build-public-site-with-theme.mjs my-theme

FROM ${KOMETIO}/kometio-public-site:${KOMETIO_TAG} AS public-site
USER root
RUN rm -rf /app/dist
COPY --from=build /workspace/apps/public-site/dist /app/dist
USER kometio

# The API only needs the manifest, to offer the theme in the editor.
FROM ${KOMETIO}/kometio-api:${KOMETIO_TAG} AS api
COPY theme.json themes/my-theme/theme.json
```

and a `.dockerignore` with `node_modules`. Then:

```sh
docker build --target public-site -t my-agency/kometio-public-site .
docker build --target api -t my-agency/kometio-api .
```

Use those two images in place of Kometio's in `docker-compose.prod.yml`
([self-hosting.md](self-hosting.md)); the editor image is Kometio's own,
unchanged. The site still offers Kometio's own themes too; set `KOMETIO_THEME`
to your theme's name on both to offer only yours.

The theme's name is its directory under `themes/`, and it cannot be one of
Kometio's own (`classic`, `docs-showcase`): the build refuses rather than
replace a theme every other site may be using.

If your theme lives in this repo instead, give it the Nx scaffolding
(copy `themes/classic`'s `package.json`/`tsconfig*.json`/
`eslint.config.mjs`/`vitest.config.mts`, renaming the package) — that is
what gives it `typecheck`/`lint`/`test` targets in CI.

## Before you call it done

1. **Look at it in a browser**, not just `astro check`. ADR-0021's
   Consequences record two real bugs — a CSS cascade surprise and a
   font-token naming trap — that only static checks missed.
2. **Look at a page with a second theme active too.** A rule that leaks is
   invisible on the theme you were designing. Anything global has to start
   from the `data-kometio-theme="<name>"` attribute core puts on `<html>`.
3. **Open the visual editor and insert a block into the header and the
   footer.** This is the exact thing the old full-shell override broke
   without anyone noticing.
4. **Check a page with no content** and a page with a lot of it.
