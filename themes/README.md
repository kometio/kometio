# Kometio theme packages

This directory holds public-site's filesystem theme packages — Tier 2 of
the two-tier theming model in [docs/adr/0021](../docs/adr/0021-site-theming-filesystem-packages-and-style-settings.md).
Read that ADR for the _why_; this file is the _how_, for anyone building
a new theme (a Kometio core theme or an agency's own).

## What a theme is

A directory under `themes/`. Since docs/adr/0042, every theme here
bundles into the same `apps/public-site` image — which one a given
site actually renders with is `Site.themeName` (DB-backed), picked live
from editor-app's Style dialog, resolved fresh per request in
`apps/public-site/src/lib/theme-registry.ts` and every `resolve-theme-
*.ts` file built on it. There is no more single build-time `~theme`
alias to point at one theme. `KOMETIO_THEME` still exists, but its role
shrank to an optional, comma-separated allow-list read at **runtime** —
it restricts which of the bundled themes a given deployment will serve
at all (an agency shipping an image whose client can only ever pick the
agency's own theme), not which one renders for a given site. Both sides
apply it since ADR-0069: `theme-registry.ts` for what gets rendered, and
`FilesystemThemeCatalogAdapter` for what the editor's picker offers —
until then only the first did, and the picker offered themes the site
would not render. Every theme on disk always ends up bundled either way: a
glob pattern has to be a static literal, so it can't be narrowed by
config. Only
`apps/public-site` reads the filesystem directly — apps/api has no
concept of theme files, and editor-app never gets filesystem access to
a theme package either; it learns what a theme declares only through the
`GET /api/themes/current/*?theme=<name>` routes apps/public-site serves
(icons, style defaults, and — since ADR-0041 — a theme's own extra
block types).

Also, since ADR-0041, every theme under here is a real Nx/pnpm package
(`@kometio/theme-<name>`, `nx.tags: ["app"]`) — it has its own
`package.json`/`tsconfig*.json`/`eslint.config.mjs`/`vitest.config.mts`
and real `typecheck`/`lint`/`test` targets that run in CI, whether or
not any site currently renders with it.

```
themes/<name>/
  theme.css           # required — design tokens
  env.d.ts            # required — two /// reference lines, see below
  theme.json          # required — manifest
  fonts.css           # optional — self-hosted webfont, see below
  fonts/              # optional — the font files fonts.css points at, and their licence
  locales.json        # optional — the theme's own UI words, per language (docs/adr/0089)
  icons/*.svg         # optional — icon set (docs/adr/0023)
  regions/
    Header.astro      # optional — the element wrapping the header's blocks
    ContentShell.astro # optional — the element wrapping the page content
    Footer.astro      # optional — the element wrapping the footer's blocks
  blocks/
    *.astro           # optional — full-file overrides of an existing core block
    *.block.ts        # optional — a genuinely NEW block type (ADR-0041), needs a matching .astro
    *.locales.json    # required alongside a .block.ts — that block's own i18n
```

## `theme.css` — the common case

Design tokens only, no markup. `apps/public-site/src/layouts/PageLayout.astro`
reads this file's `:root` block per request (via `theme-registry.ts`'s
`getThemeCssRaw`) and re-emits it as an inline `<style>` with every
declaration marked `!important`, so a theme's values win over
`../styles/global.css`'s bare fallback defaults regardless of the order
Astro happens to inject that stylesheet — see docs/adr/0042 and
PageLayout.astro's own comments for why a plain `import './theme.css'`
can't do this anymore now that the theme is chosen per request rather
than per build. Every block under
`apps/public-site/src/components/blocks` is meant to be restyled entirely
by swapping these tokens — the same way shadcn/ui components are themed:
one shared implementation, restyled via CSS custom properties, never
duplicated per theme.

Two things a theme's `theme.css` must define in its `:root` (see
`themes/classic/theme.css` for the working example). A theme does not
write any `@theme inline` block of its own: only `:root` custom
properties reach the page, and core's `apps/public-site/src/styles/global.css`
owns the Tailwind mapping from these names to utilities.

- **Color tokens** — `--background`, `--foreground`, `--primary`,
  `--primary-foreground`, `--secondary`, `--secondary-foreground`,
  `--muted`, `--muted-foreground`, `--border`. Blocks use these via
  Tailwind utilities (`bg-primary`, `text-foreground`, …), never
  hardcoded hex values.
- **`--font-sans-value`** — the font stack. Core maps it _indirectly_
  (`--font-sans: var(--font-sans-value)`), so declare `--font-sans-value`,
  not `--font-sans` — this indirection is what lets Tier 1's font override
  (docs/adr/0021) redefine just `--font-sans-value` without fighting
  Tailwind's own token resolution. Set `--font-sans` directly and Tier 1's
  font picker silently stops working for your theme; see
  `apps/public-site/src/layouts/PageLayout.astro`'s own comments for why
  every Tier 1 override is `!important`.

Optional, with core's defaults in `apps/public-site/src/styles/global.css`:

- **Headings** — `--kometio-heading-font` (a display face; `inherit`, the
  body font, by default), `--kometio-heading-tracking`,
  `--kometio-heading-weight`, `--kometio-h1-weight`, `--kometio-heading-leading`
  and the sizes `--kometio-h1-size`…`--kometio-h6-size`. Only `:root` custom
  properties reach the page from `theme.css`, so these tokens are the way to
  change headings — a rule like `h1 { font-family: … }` in `theme.css` is
  ignored.
- **Code** — `--kometio-code-font`, the monospace face of the Code block and
  of `code` inside text (the system's monospace by default).
- **Layout** — `--kometio-content-width`, `--kometio-content-width-wide`,
  `--kometio-content-gutter` (ADR-0049), `--radius`, the `--shadow-*` scale
  (`xs` to `2xl` and `inner`, Tailwind's values) and `--link`/`--link-hover`
  (the primary colour and the text colour).
- **States** — what a block reports: a sent form and a failed one, a
  callout's tone, a status badge. For each of `info`, `success`, `warning`
  and `error`: `--kometio-<state>` (the tone: a border, a dot),
  `--kometio-<state>-text` and `--kometio-<state>-surface` (the tint behind
  it); and `--kometio-rating`, a filled star. They are meant to stay
  recognisable whatever the palette, so change them to retune, not to
  rebrand; keep each text at 4.5:1 on its surface.

Declare only what your theme changes: a value restated at core's default
is a copy that stops following core the day core moves it.

- **Rhythm** — `--kometio-block-gap` (after every root block),
  `--kometio-heading-gap` (after a Heading block) and
  `--kometio-page-start-gap` (above a page's first root block, unless that
  block is full-width). A region that wraps the page content should not add
  its own space above it: the first block already has it.

## `theme.json` — the manifest

```json
{ "name": "my-theme", "allowStyleOverrides": true, "stickyFooter": false }
```

**`name`** — required to upload the theme from the editor (ADR-0091):
lowercase letters, digits and dashes, up to 40, and not one of Kometio's
own. It is what sites choose the theme by. A theme built into images
takes its name from its directory under `themes/` instead.

**`allowStyleOverrides`** — `true` (or the file/field missing
entirely) means Tier 1's Style panel can override this theme's own
tokens on any site running it — this is the default, and what every core
theme ships with. Set it `false` to make the panel permanently inert for
this theme, on every site, regardless of what's saved in the database —
the mechanism an agency reaches for when they've built a bespoke theme
for a client and don't want the client's own panel edits (present or
future) to ever touch it. See docs/adr/0021's "Two-gate override
composition" section for the full reasoning, including why this can't be
a database-level toggle instead (a client-editable switch can't protect
the _agency's_ design intent from the client themselves).

It is a ceiling over **everything** a site puts on top of the theme, not
only the Style panel: Tier 1 tokens, the per-type block styles from the
Global Styles dialog, and the per-instance ones from a block's own
toolbar. Setting it `false` means none of the three reaches the page.

Do not confuse it with the site's own `overridesEnabled` switch in that
Style panel, which is a different and much narrower thing: it covers
Tier 1 only, so a client who turns it off goes back to your colours and
fonts while the styling they set on individual blocks stays. The two were
one condition until 2026-09-07 — see the amendment on ADR-0021 for why
that was wrong.

Setting it `false` is visible in the editor, not only at render: the
block toolbar drops both styling buttons, the Global Styles dialog says
the theme does not allow it, and the Style settings page turns its fields
off with a note. The editor reads
`GET /api/themes/current/capabilities` for this.

**`stickyFooter`** — `true` pins the footer to the bottom of the viewport
on pages too short to fill it. It is a manifest flag rather than something
you write in your own CSS because it targets `<body>`, which core owns: a
theme can only reach `<body>` through `<style is:global>`, and a global
rule from one theme lands on **every other theme's** pages too (that is a
real bug this directory shipped, not a hypothetical). Declared here, core
applies it with its own scoped style and nothing leaks.

## Going past tokens: block overrides

A theme that wants more than a restyle — a genuinely different `Hero`
layout, a custom block — can ship its own `blocks/Hero.astro`; it wins
over core's own component for any site running that theme. This is an
escalation on top of the token-only default, not the expected common
case — most themes should need `theme.css` and `theme.json` alone.

**Wired** (2026-08-21, made per-theme by docs/adr/0042):
`blocks/<Name>.astro` overrides the matching core component. Every
bundled theme's overrides are globbed together once
(`import.meta.glob('.../themes/*/blocks/*.astro')` in
`apps/public-site/src/lib/resolve-theme-block-override.ts`) and looked up
by `(themeName, blockType)` (`blockDispatchFor` in
`apps/public-site/src/lib/block-dispatch-for-theme.ts`, once per theme), from
`BlockRenderer.astro`'s own `site.themeName` — a theme that ships nothing there falls back to core
with zero error (a glob matching nothing is just an empty map, and an
unknown theme name falls back to a bundled one rather than rendering
blank). The next level up — the furniture _around_ the blocks — is not
another override but the narrower `regions/` contract described in the
following section. `classic` ships neither, needing only tokens.

### An override has to forward `instanceClass`

A block whose descriptor declares `stylableProperties` is handed an
`instanceClass` prop, and it must end up on the element the block renders:

```astro
---
type Props = HeroProps & { instanceClass?: string | null };
const { title, instanceClass } = Astro.props;
---
<header class:list={['kometio-docs-hero', instanceClass]}>…</header>
```

That class is what the per-instance style rule targets (ADR-0047). Since
those styles became CSS rules rather than an inline `style` attribute —
an inline style cannot hold the container query a per-breakpoint value
needs — an override that drops the prop silently disables per-instance
styling for that block type on every page of every site using the theme.
Silently: the rule is still emitted into the page, matching nothing.

`apps/public-site/src/lib/theme-block-override-styling.spec.ts` fails,
naming the theme and the block, when an override of a stylable core block
does not forward it.

The same applies to **`variantClass`**, for a block type that declares
variants: it carries `.kometio-button--secondary` and comes from the same
place, computed by `BlockRenderer` from `Block.variant`. An override that
drops it shows a look picker in the editor that saves a choice and changes
nothing on the published page.

```astro
<a class:list={['kometio-button', variantClass, instanceClass]} href={href}>
```

What each class then DOES is still the theme's business: a replacement
may honour a per-instance value or deliberately draw over it, as long as
it forwards the class.

### A replacement is yours, and says what it leaves out

A `blocks/<Type>.astro` replaces core's block completely — a Hero that is
a slider, a switcher that is an icon: core is a starting point, not a
constraint. What the replacement cannot change is what the editor
offers: every core look of that block (`CORE_BLOCK_VARIANTS` in
block-sdk) is still in its picker. So each of them either has a rule in
your file (`.kometio-button--outline`) or is listed in
`blocks/<Type>.variants.ts`'s `hides`, and the editor stops offering it
on a site with your theme. `checkOverridesDrawVariants`, run from your
`blocks.spec.ts`, fails on a look that is neither: docs-showcase's Button
had dropped Outline and Link, and the docs site offered both and drew a
filled button for each.

Only replace a block to change what it IS. To change how it looks, the
tokens and a variant are enough, and they keep up with core by
themselves; a replacement has to follow core's fixes by hand.

## Adding a look to a core block (variants)

A block type offers named **variants** — looks the client picks from a
menu (ADR-0047). `Button` ships `secondary`; a theme adds its own without
touching the core block, in `blocks/<Type>.variants.ts`:

```ts
import type { ThemeBlockVariant } from '@kometio/block-sdk';

const variants: ThemeBlockVariant[] = [
  { value: 'ghost', label: { en: 'Ghost', it: 'Fantasma' } },
];

export default variants;
```

…and the CSS for `.kometio-button--ghost` goes wherever this theme's CSS
lives — its own `Button.astro` override, or `theme.css`. Nothing else is
needed: `BlockRenderer` builds the class from `Block.variant`, so the look
renders as soon as somebody picks it.

The same file can take core looks away, for a block your theme draws
without them (see "A replacement is yours" above). The default export may
then be empty:

```ts
export const hides = ['outline', 'link'];
export default [];
```

**This is the file to use for the Figma workflow.** A design file with
twenty button variants becomes twenty entries here, one rule each — not
twenty block types. Declaring a `Button.block.ts` would be _redefining_
the core Button, which is refused (ADR-0048): it would duplicate every
field and lose the core block with them.

Rules, all checked by your theme's own `blocks.spec.ts` in CI, and again
by the loader at runtime:

- `value` becomes part of a CSS class, so it is lower case letters,
  digits and dashes, starting with a letter
- `default` is reserved — it names the block's own look
- a label for **every** locale the editor speaks; one missing means the
  client sees a raw key
- the type has to exist, and you may not redeclare a variant the block
  already has — add a different look, or restyle the existing one from
  the editor's Global Styles, which is keyed by `(type, variant)`
- `hides` names looks the block has (a typo would hide nothing), never
  `default`, and never one the same file adds

A variant is additive by construction: adding or removing one never
touches a stored page. A block wearing a look this theme does not define
simply renders in its default look.

## Adding a style property core does not have

A theme can also give a block a **new style knob**, not just a new look,
in `blocks/<Type>.style.ts`:

```ts
import type { ThemeStyleProperty } from '@kometio/block-sdk';

const properties: ThemeStyleProperty[] = [
  {
    key: 'windowTint',
    control: 'color',
    label: { en: 'Window chrome', it: 'Cornice della finestra' },
  },
];

export default properties;
```

…and the CSS reads the variable **derived from the key**:

```css
border: 1px solid var(--kometio-override-window-tint, rgb(255 255 255 / 10%));
```

You do not name that variable. `windowTint` becomes
`--kometio-override-window-tint`, always: a theme naming its own could point
two properties at one variable, or collide with a core one, and neither
mistake announces itself.

**When to reach for this rather than plain CSS.** Only when the AGENCY
should tune the value per block or per block type from the editor. If the
value is the theme's own design decision, write it in your CSS — that is
simpler and nobody can break it.

Rules, checked by your theme's `blocks.spec.ts` in CI and again by the
loader:

- `key` is lower camel case; it becomes a CSS custom property
- `control` is `color`, `length` or `select`; a `select` needs `options`
- a label for **every** locale the editor speaks
- the type has to exist, and the key must not be one core already ships —
  add that one to the block's `stylableProperties` instead of redeclaring
  it

## `regions/` — changing the page's own furniture

Tokens restyle the blocks; `blocks/*.astro` rewrites one of them. What is
left is the furniture _around_ them — the `<header>` element itself, the
column layout the content sits in, the `<footer>`. A theme supplies any of
three optional files for that:

| File                         | Replaces                                                    | Extra prop        |
| ---------------------------- | ----------------------------------------------------------- | ----------------- |
| `regions/Header.astro`       | core's `<header>` wrapper                                   | `sticky: boolean` |
| `regions/ContentShell.astro` | core's content wrapper (which is nothing at all by default) | —                 |
| `regions/Footer.astro`       | core's `<footer>` wrapper                                   | —                 |

Supply none and you get core's own, byte for byte as today. Supply one and
you decide only the wrapping element and its classes — **you receive the
already-rendered blocks as a slot**:

```astro
---
import type { ThemeHeaderProps } from '@kometio/theme-runtime';
export type Props = ThemeHeaderProps;
const { sticky, class: className } = Astro.props;
---
<header class:list={['my-header', className, { 'my-header--sticky': sticky }]}>
  <slot />
</header>
```

**A region that forgets `<slot />` makes the entire page vanish, silently.**
Nothing warns you — not `astro check`, not the build. It is the first thing
to check if a page comes back blank.

### Why it is a slot and not a copy

Until 2026-09-04 a theme could instead ship a `PageLayout.astro` at its own
root that replaced core's layout wholesale. That is **removed**, not
deprecated. It looked cheaper and was not: `docs-showcase` had to copy 581
lines of shell in order to change the one in the middle, and the copy then
drifted in silence, shipping four real defects nobody caught — the WCAG
2.4.1 skip link disappeared, the `data-kometio-root-blocks` attributes went
with it (so inserting a block into the header or footer from the visual
editor was simply broken on that theme), the theme's `theme.css` leaked its
whole dark palette onto **every other theme's** pages, and the copy never
received a token-injection fix core had made in the meantime.

So the list of what stays core's is the point of the design, not a
limitation to work around: all of `<html>`/`<head>`/`<body>`, the skip
link, `data-kometio-root-blocks`, block rendering, CSP nonces, cookie
consent, schema.org and the editor's preview bridge. If a region cannot
express what your design needs, the contract gets extended — don't reach
for `is:global` to get around it.

### The props

Every region receives `ThemeRegionProps` (see
`libs/theme-runtime`'s `theme-regions.ts`, which is the authority):

- **`locale`**, **`currentPath`** (`Astro.url.pathname`, no trailing slash)
  and **`i18n`** (core's translator, already bound to `locale`).
- **`route`** — `'page' | 'search' | 'error'`. Regions are never rendered
  on the 500 page at all: that page is the last error handler, and a throw
  there has nowhere left to propagate.
- **`editable`** — true only inside the editor's preview iframe.
- **`pageTree()`** — an async accessor for the site's published page tree.
  Call it only if you need it: core owns the fetch, memoizes it **per
  request** (pages get published between requests), guards on the site's
  domain and resolves to `[]` on failure rather than throwing. This one
  prop is most of what the old copies got wrong.
- **`class`** — Astro injects this because core's layout has `<style>`
  blocks of its own. Forward it onto your root element to let core's scoped
  styles reach it, or ignore it deliberately.

`Site.themeName` is _not_ passed, and neither is `PublishedSite`: it would
carry `headScript`, `trackerScripts` and `cookieBannerSettings` along with
it — an invitation to reimplement exactly the infrastructure this design
takes off your hands.

### Styling a region

Write ordinary scoped `<style>` in the region file. One rule to internalise,
because it has bitten this codebase twice: **Astro's scoping follows the
file the element is written in.** A rule for `<header>` only matches if it
lives in the same file that writes the `<header>` tag. A selector aimed at
something core renders (the `<footer>`, a block's root) needs
`:global(...)` on that part — keep the left-hand side scoped so the rule
still cannot escape onto another theme.

For genuinely global CSS the sanctioned hook is the
`data-kometio-theme="<name>"` attribute core puts on `<html>`: start every
global selector from there and your rules cannot reach a page rendered with
a different theme.

## `fonts.css` — a self-hosted webfont

Optional, and the only supported way to ship a font: the font's files in
the theme (`fonts/`), declared with `@font-face` in `fonts.css`, the way
`themes/docs-showcase/fonts.css` does it. Not an npm package — a theme
cannot install packages of its own (docs/adr/0089); a package like
`@fontsource-variable/sora` is only where you copy the `.woff2` files and
their `@font-face` rules from. Keep the font's licence next to the files.

```css
/* themes/<name>/fonts.css */
@font-face {
  font-family: 'Sora Variable';
  font-display: swap;
  font-weight: 100 800;
  src: url(./fonts/sora-latin-wght-normal.woff2) format('woff2-variations');
}
```

Then point `--font-sans-value` at it in `theme.css` — using the family name
the `@font-face` declares, **exactly**. A near-miss (`Sora` for `Sora
Variable`) fails silently: the browser falls through to the next entry in
the stack and the font you bundled simply never loads. Vite rewrites the
`url()`s and bundles the font files, which a hand-written `@font-face` in
`theme.css` could never get (core only extracts that file's `:root` custom
properties, and the `url()` would never pass through the bundler).

**Never `<link>` to Google Fonts or any other CDN.** It sends every
visitor's IP address to a third party — a German court ruled on exactly
that in 2022 — which is untenable for a product that sells "your data stays
on your own machine" and generates the customer's privacy policy for them;
it also breaks any intranet deployment outright. Check you actually have
redistribution rights for the font: Google Fonts are OFL/Apache, a
commercial licence usually is not.

Every bundled theme's `fonts.css` ends up in the same stylesheet, which is
safe by construction rather than by luck: an `@font-face` that no rule
references downloads nothing. A theme wanting only system fonts ships no
`fonts.css` at all — see `themes/classic`.

## Adding a genuinely new block type (ADR-0041)

A `blocks/<Type>.astro` with no matching `.block.ts` is an override, per
above — same type, different render. Adding a `.block.ts` next to it
(same basename) declares a brand-new block type instead, one core
doesn't know about at all: `blocks/Faq.block.ts` + `blocks/Faq.astro` +
`blocks/Faq.locales.json` together register a `Faq` block that shows up
in the editor's picker, under the category its descriptor declares,
translated, with zero edits to `libs/block-registry`,
`BlockRenderer.astro`, or `apps/editor-app`'s locale files. See
[libs/block-sdk/README.md](../libs/block-sdk/README.md#adding-a-block-from-a-theme-without-touching-core)
for the authoring contract itself (schema, descriptor, i18n key
convention) — this file only covers the theme-package side: your
theme's own `blocks/blocks.spec.ts` (copy `themes/docs-showcase/blocks/blocks.spec.ts`
if you're starting from `classic`, which ships none) is what actually
runs `validateThemeBlockSet()` against everything under `blocks/` in CI,
on every build. `themes/docs-showcase/blocks/StatusBadge.*` is a real,
live worked example if you want to trace one end to end.

## `icons/` — the icon set (docs/adr/0023)

Optional. One `.svg` file per icon, filename (minus extension) is the
icon's name — e.g. `icons/arrow-right.svg` registers `arrow-right`. A
theme that ships even one icon here uses **only** that set — no
per-missing-name fallback to the default set, this is a binary choice per
theme, not a merge (see ADR 0023's Consequences for why).

So a page can hold an icon your set lacks — chosen under another theme,
say — and the site draws nothing for it. The editor says so (ADR-0090):
the block's row in Layers carries a warning, and its icon field names the
missing icon. Its picker offers only your set, so nobody picks another
one you lack. Logos (`brand:`) and media-library images are the same under
every theme, so they are never missing.

A theme that ships no `icons/` directory at all falls back to the full
current [Lucide](https://lucide.dev) icon set, resolved from the
`lucide-static` dependency in `apps/public-site/package.json` (raw SVG
files, same icon family already used for editor-app's own UI chrome via
`lucide-react`) — not a hand-picked/vendored subset, so it stays in sync
automatically whenever that dependency is bumped. See
`apps/public-site/src/lib/resolve-theme-icons.ts`.

editor-app's icon picker never reads this directory directly (it can't —
separate app, no filesystem access to a theme package at runtime); it
fetches the resolved manifest from `GET /api/themes/current/icons`
instead. That route (like its four siblings) takes an optional
`?theme=<name>` since docs/adr/0042 — without it, it answers for a
fallback theme rather than erroring.

## What a theme imports

Everything a theme codes against comes from packages, never from a relative
path into `apps/public-site` — that coupling is what used to make a theme
impossible to develop outside this monorepo, and there is now none of it
left in either core theme:

| Package                  | What you get                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kometio/theme-runtime` | `localePath`/`localePathFromAncestors`/`localeDirection`, the `DictionaryTranslator` for `locales.json`, the `regions/` props, `PageTreeNodeDto`. |
| `@kometio/shared-types`  | Every block's props type and the published-site/page shapes.                                                                                      |
| `@kometio/block-sdk`     | `defineBlock`, the field types, `CORE_BLOCK_TYPES` for your own collision check, and `z` for a block's schema.                                    |

Your `env.d.ts` needs exactly two lines — the second is what types
`Astro.locals` for you:

```ts
/// <reference types="astro/client" />
/// <reference types="@kometio/theme-runtime/locals" />
```

### Icons

Two cases, and the split is _who chose the icon_:

- **The editor's user chose it**, on a block that has an icon field
  (`Feature`, `NavLink`): core resolves it and passes it to your override
  as `iconSvg`. Just render it — `<span set:html={iconSvg} />`.
- **Your theme wants one of its own**, on a block that has no icon field
  at all (docs-showcase puts a globe in its `LanguageSwitcher` override):
  `Astro.locals.resolveIcon('globe', site.themeName)`.

Never import the icon registry. It cannot be a package — it is an eager
glob over every theme's `icons/` plus `lucide-static` resolved through
`import.meta.resolve`, all of it the app's — which is exactly why core
hands it to you instead.

## The boundary you can't cross

A theme can restyle or rewrite anything in the rendering layer, and
(since ADR-0041) add genuinely new block types of its own. What it still
cannot do is introduce a new _data field_ on an **existing** block type
— that requires extending that block's own Zod schema in
`libs/shared-types`, which is core, shared by every theme. A theme
renders the canonical `Block[]` content model (ADR-0007); it doesn't get
to redefine what an existing block's `props` shape contains, only add
block types with shapes of their own.

## A theme that lives outside this repo

Verified end to end on 2026-09-04 (docs/adr/0043): a theme authored in a
directory outside the monorepo renders — its region, its scoped CSS, its
tokens — from a real Docker image, with **no code changes and no new
machinery**. No npm package, no Vite alias, no `import.meta.glob`
`exhaustive: true`. The only rule is that the theme's directory is present
at `themes/<name>/` when the build runs.

**In development, symlink it:**

```sh
ln -s /path/to/my-theme themes/my-theme
```

Restart `apps/public-site` once (a brand-new directory is only seen when
the eager globs re-evaluate at process start) and pick it in the editor's
Style dialog.

**For a deployment, it has to be a real directory** in the Docker build
context — `COPY` preserves a symlink _as a symlink_, so the link dangles
inside the image and the theme is silently unreadable (measured, not
assumed). Copy, clone, or add it as a git submodule under `themes/<name>/`
before `docker build`. Both images then pick it up on their own:
`apps/public-site` bundles the whole theme, and `apps/api` copies its
`theme.json` into `/app/themes/` so it appears in the editor's theme
picker.

**A theme that only renders needs no packaging at all** — no
`package.json`, no `tsconfig*.json`, no Nx wiring. Those exist so a theme
gets its own `typecheck`/`lint`/`test` targets in CI; a theme living in its
own repo runs its own. What it does need is the two `env.d.ts` reference
lines and its dependencies resolvable — see "What a theme imports" above.

## Checklist for a new theme

1. Copy `themes/classic/` as a starting point — including its
   `package.json`/`tsconfig*.json`/`eslint.config.mjs`/`vitest.config.mts`
   (rename the package to `@kometio/theme-<name>`) and its
   `blocks/blocks.spec.ts`, even if you're not adding any `.block.ts`
   files yet (see ADR-0041) — it's what makes this theme's own files
   real, `nx run-many`-visible `typecheck`/`lint`/`test` targets.
2. `pnpm install` — new workspace packages need it to link. Check your
   `env.d.ts` carries both `/// reference` lines above; without the second
   one `Astro.locals.resolveIcon` is untyped and `astro check` will say so.
3. Rewrite `theme.css`'s `:root` values — every token listed above,
   `--font-sans-value` included.
4. Decide `allowStyleOverrides` in `theme.json` — `true` unless you have
   a specific reason (see above) to lock it down.
5. Only if tokens genuinely aren't enough: add a `regions/` file, a
   `blocks/*.astro` override, or a `fonts.css`. Each one is an escalation;
   a theme needing none of them is the expected case, and the cheapest one
   to keep working across upgrades.
6. Restart `apps/public-site`'s dev server once — a brand-new directory
   under `themes/` is only picked up when the eager globs re-evaluate at
   process start, not on a file save. After that, point a site at it by
   picking it in editor-app's Style dialog ("Tema"), which writes
   `Site.themeName`; switching between already-bundled themes needs
   nothing but a page reload (docs/adr/0042).
7. Verify live in a browser, not just `astro check` — see docs/adr/0021's
   Consequences for two real bugs (a CSS cascade surprise and a font-token
   naming trap) that only static checks missed. If you wrote a region,
   look at the page with a second theme active too: a rule that leaks is
   invisible on the theme you were designing.
