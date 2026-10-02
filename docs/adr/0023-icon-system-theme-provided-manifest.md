# 0023 — Icon system: theme-provided manifest, curated default set

**Status**: Accepted — 2026-08-22, implemented 2026-08-23 (see
"Implementation notes" at the end for where the build diverged from the
original decision text below).

## Context

No block field type supports icons at all today — a menu-link block, for
instance, has no way to show an icon beside its label. The user asked for
this with one explicit constraint: a curated built-in set should exist
out of the box, but an agency building its own theme (ADR 0021's
filesystem theme packages) must be able to supply its **own** icon set
instead, the same way a theme already supplies its own colors and fonts —
not a fixed set baked into core with no per-theme escape hatch.

The concrete obstacle: `editor-app` (where the icon picker UI lives) and
`apps/public-site` (where a theme's files actually live, resolved via the
build-time `~theme` Vite alias) are **separate applications** — ADR
0021's own README is explicit that "nothing outside `apps/public-site`
reads this directory: editor-app and apps/api have no concept of which
theme is active." A picker needs to show the active theme's actual icons
with a live preview; it cannot just import `~theme/icons/*` the way
public-site's own rendering code does.

## Decision

### A theme declares its icon set the same way it declares fonts/colors

`theme.json` (ADR 0021's per-theme manifest) gains an optional `icons`
field:

```json
{ "icons": { "path": "icons/" } }
```

A theme ships `~theme/icons/*.svg`, one file per icon, filename (minus
extension) is the icon's name. A theme that omits `icons` entirely falls
back to a **curated default set bundled with core** (Lucide-based,
resolved from the existing `lucide-react` dependency already used
throughout `editor-app`) — every theme gets a usable icon set with zero
configuration, matching how a theme that ships no `theme.css` overrides
still inherits sane defaults today.

### A new API endpoint bridges the two apps

`GET /public/themes/current/icons` (new, unauthenticated, same trust
level as the rest of `public-pages` — no user data involved) returns the
active theme's resolved icon manifest: `[{ name: string, svg: string }]`.
Resolved server-side inside `apps/public-site`'s own build (the only
place `~theme` is a real alias) via `import.meta.glob('~theme/icons/*.svg', { eager: true, query: '?raw' })`
— same mechanism already used for block/layout overrides
(`resolve-theme-block-override.ts`), not a new resolution strategy. Falls
back to the bundled Lucide set when the glob matches nothing (a theme
declared no `icons` path, or the field is absent).

`editor-app` fetches this endpoint once per session (site's theme rarely
changes mid-session) and renders a real visual picker — a grid of
icons with live SVG preview — instead of a freeform name field a
non-technical editor would have to guess correctly.

### The field type and stored value

A new field kind, `kind: 'icon'`, stores a plain name string (e.g.
`"arrow-right"`) in the block's `props` — not the SVG markup itself, so a
theme swap changes every already-placed icon's actual appearance for free
(the same "restyle without touching content" property every other themed
value already has). `apps/public-site`'s own rendering resolves the name
against **its own** `~theme/icons/*` (or the bundled default) at render
time — the same source of truth the API endpoint reads, so editor-app's
picker and the published page can never show a different icon for the
same name.

## Consequences

- `libs/block-registry` gains an `iconField` kind alongside `text`,
  `color`, etc.
- A theme that ships a partial icon set (fewer icons than a page already
  references, e.g. after switching themes) has no fallback per missing
  icon name — renders nothing for that one icon. Accepted for now: the
  same "you get what the active theme provides" trade-off ADR 0021
  already accepts for colors/fonts; revisit only if this actually bites
  someone.
  **Amended by [ADR-0090](0090-a-missing-theme-icon-is-flagged-in-the-editor.md)**:
  the rule stays, and the editor now flags every block whose icon the
  theme lacks.
- Not yet decided: whether a block can offer a _curated subset_ of icons
  (e.g. only directional arrows for a "next/prev" field) rather than the
  full active set — deferred until a concrete block needs it.

## Implementation notes (2026-08-23)

- **Default set source**: `lucide-static@^1.31.0` added as a real
  dependency of `apps/public-site` (pinned to the same version editor-app
  already uses for `lucide-react`), not a "resolved from the
  `lucide-react` dependency" trick — `lucide-react` ships React
  components, not raw SVG; `lucide-static` is the sibling package in the
  same Lucide monorepo that ships one `.svg` file per icon, the form this
  system actually needs. Resolved server-side via Node's
  `import.meta.resolve('lucide-static/package.json')` + `fs.readdirSync`
  (`resolve-theme-icons.ts`), not `import.meta.glob` — a glob pattern
  reaching into `node_modules` isn't a relative path or the `~theme`
  alias Vite's glob handles in this project, while Node's own module
  resolution finds the package wherever pnpm actually symlinked it,
  independent of hoisting. `~theme/icons/*.svg` itself is still resolved
  via `import.meta.glob` (it does need the alias).
- **Field kind**: implemented as `customField('icon', 'Icona',
IconPickerField)` — `kind: 'custom'`, the same mechanism every other
  picker field already uses (Page/Media/Gallery/Form) — not a new
  `kind: 'icon'` member on `FieldDescriptor`. The union has no native
  `color` kind either despite this ADR's "alongside text, color, etc."
  phrasing; every rich-picker field in this codebase is `custom`, and
  matching that existing, consistent pattern was judged more valuable
  than adding a new union member for one field type.
- **Endpoint path**: `GET /api/themes/current/icons`, not
  `/public/themes/current/icons` — `apps/public-site`'s existing API
  routes all live under `/api/*` (see `render-block-fragment.ts`,
  `newsletter/subscribe.ts`); there is no `/public/*` prefix convention
  in this app to match.
- **First real consumer**: `NavLink` (the ADR's own motivating example)
  — `NavLinkProps.icon: string | null` (default `null`, backward-
  compatible with every NavLink saved before this field existed),
  rendered via `resolveIconSvg()` in `NavLink.astro`. Other blocks are
  deliberately not wired up yet — no concrete need identified for them
  at this point.
