# block-registry

The editor's block catalog: for every one of the block types a site can be
built from (Hero, Text, Image, Container, Nav, Button, Testimonial, ...; over
a hundred, and `BLOCK_TYPES` in `@kometio/shared-types` is the list),
a plain-data `BlockDescriptor` — label, category, default props, the field
form the Inspector panel renders, container/nesting rules, and which style
properties can be overridden — plus the handful of React field components
and context-based "pickers" the editor's Inspector panel needs to edit
those props. It is the successor to Puck's block-config API, purpose-built
for this codebase's own canvas editor (see
[ADR-0007](../../docs/adr/0007-nested-block-content-model-independent-of-puck.md)).

## What this package is _not_

This registry has **no `render` function and renders nothing itself**. The
real, single renderer for every block is the matching Astro component in
`apps/public-site` — the editor canvas shows that exact same rendered
output live inside an iframe rather than maintaining a second,
React-based re-implementation of every block's markup (see the visual
editor plan). This is also why the per-block-type `props` Zod schemas
(`HeroProps`, `ButtonProps`, ...) live in `@kometio/shared-types` rather than
here: `apps/public-site`'s `BlockRenderer.astro` needs those shapes without
pulling in this package's React dependency at all — see `shared-types`'
own README for the concrete TypeScript resolution conflict that happened
when it briefly did.

## `BlockDescriptor` (now `@kometio/block-sdk`'s `field-types.ts`)

The core data shape — moved to `@kometio/block-sdk` 2026-09-01 so a
third-party block author only needs that package, not this one (see
[ADR-0037](../../docs/adr/0037-block-sdk-third-party-block-extensions.md)
and `block-sdk`'s own README). `libs/block-registry/src/lib/field-types.ts`
now just re-exports it, so every existing `import type { BlockDescriptor }
from '../field-types'` below kept working unchanged:

```ts
interface BlockDescriptor<Props = Record<string, unknown>> {
  type: string;
  label: string;
  category: string;
  defaultProps: Props;
  fields: FieldDescriptor[];
  isContainer?: boolean;
  allowedChildTypes?: string[];
  stylableProperties?: readonly (keyof BlockStyleOverride)[];
  defaultStyle?: BlockStyleDefaults;
}
```

`FieldDescriptor` is a small closed union (`text`, `textarea`,
`radio`/`select`, `number`, `boolean`, `custom`) describing how the
Inspector panel should edit one prop — this replaces Puck's `Fields<T>`
API. `inlineEditable: true` on a `text`/`textarea` field marks it as
editable directly on the canvas via TipTap mounted in the preview iframe,
not just through the Inspector form. `FieldBuilder.custom<V>(...)` exists
purely to contain, in one documented place, the single unavoidable
`unknown`-cast a `kind: 'custom'` field needs — a heterogeneous
`FieldDescriptor[]` array can't otherwise express "this component's value
is really a `PickedPage`", so the alternative would be repeating that cast
at every call site instead of once here. Every first-party block is built
with `coreBlock(contract, { … })` (`define-core-block.ts`): its `type`, its
`defaultStyle` and — unless it lists its own — its `stylableProperties` come
from the block's contract in `@kometio/shared-types`
([ADR-0115](../../docs/adr/0115-a-block-is-declared-once-as-a-contract.md),
[ADR-0116](../../docs/adr/0116-a-core-blocks-descriptor-is-built-on-its-contract.md)),
so what a descriptor writes is only what the editor adds: label, category,
icon, defaults, fields, containment. Two files are not built that way, and
say why: `blocks/section.block.ts` (its props type is declared by hand, the
inference of its schema contradicts itself) and `blocks/callout.block.ts`
(the worked example of `defineBlock()`, the surface a theme's own block
gets).

`stylableProperties` + `defaultStyle` are this block's opt-in to the
component/instance style-override system
([ADR-0022](../../docs/adr/0022-component-and-instance-style-overrides.md))
— absent or empty means no "Style" button/override popover for that type at
all; the rollout across all the blocks is intentionally incremental, not
mechanical. For a first-party block both are derived: `defaultStyle` is the
contract's `style`, and `stylableProperties` is that object's keys, so a
block that declares a default for a property offers it and a block cannot
offer one it has no default for. A block with defaults for the site and no
style panel in the editor (Anchor's `maxWidth`) says `stylableProperties: []`.
The preset this paragraph used to describe (`BlockStyleRegistry.STANDARD`,
copied by 33 blocks) is gone with it: the five properties are each contract's
own `style`.

## Adding a block

1. The file: `blocks/<name>.block.ts`, which exports one `…Block` built with
   `coreBlock` on its contract (ADR-0116).
2. `pnpm run blocks:barrel`, which writes `blocks/index.ts` from the files that
   are there (ADR-0132). The registry's spec fails, naming that command, if it
   is behind the directory.
3. Its place in the picker: one line in `pageBlocks` (`config.ts`) — or in
   `headerFooterBlocks` (`layout-config.ts`) — which is the order the picker
   shows and so a decision. A block that is in neither is a file nobody can
   reach, and the spec says so.

## The two registries (`config.ts` / `layout-config.ts`)

- **`pageBlocks`** (`config.ts`) — the ~40 blocks droppable into ordinary
  page content, plus `pageBlockCategories` for the block-picker UI's
  grouping. "Not registered = not droppable", no separate deny-list to
  keep in sync.
- **`headerFooterBlocks`** (`layout-config.ts`) — the distinct, smaller
  palette (11 blocks: Nav, NavLink, LanguageSwitcher, HamburgerMenu,
  NavDropdown, plus Text/Image/SearchBox/PromoBar/BackToTop/WhatsAppButton)
  available inside the site-wide header/footer editor
  ([ADR-0018](../../docs/adr/0018-site-level-header-footer-layout-sections.md)).
  One shared registry serves both the header and the footer editor — which
  one you're editing is the `kind` on the `SiteLayoutSection` entity being
  edited, not anything expressed here. A non-technical editor structurally
  cannot drag a page-only block (Hero, Gallery, Form) into either: it's
  simply absent from this list, no runtime validation required to enforce
  it. Note `Breadcrumb` lives in `pageBlocks`, not here, even though it
  visually sits in page chrome — it depends on the current page's position
  in the hierarchy, making it intrinsically per-page content rather than
  shared header/footer content.

Text, Image, and SearchBox appear in _both_ registries — same descriptor,
same underlying Astro component, no duplication.

## Dependency inversion for app-specific pickers

Several blocks need the editor to let a user pick something that only
`apps/editor-app` knows how to fetch — an existing media item, a form, a
page, or a theme icon. This package can't own that: it has no HTTP client,
no knowledge of the API base URL, and deliberately isn't meant to grow any
application-level UI (dialogs, etc.) just to support it. Instead it
defines a `*Port` interface plus a React Context per capability
(`MediaPickerContext`/`useMediaPicker`, `FormListContext`/`useFormList`,
`PageListContext`/`usePageList`, `IconListContext`/`useIconList`), and each
corresponding field component (`MediaPickerField`, etc.) calls the
`use*()` hook rather than fetching anything itself. `apps/editor-app`
supplies the real implementation (backed by its actual API clients) via a
`<Context.Provider>` wrapped around the canvas — the same inversion
pattern already used on the backend for auth/tenant context via Ports.
Calling a `use*()` hook outside its provider throws immediately with a
message naming the missing provider, rather than failing silently.

`ctaLinkFields()` (`fields/link-type-field.ts`) is a related
de-duplication: the `linkType` radio + page picker + URL text field trio
used to be hand-copied identically across six blocks (Banner, Button,
Link, NavLink, PricingPlan, PromoBar) — flagged in the 2026-08-24 security
review — and is now generated from one function. `visibilityField` and
`positionField` are the same pattern for the `Visibility` and
`NavItemPosition` shared props.

## Used by

Only `apps/editor-app` imports `@kometio/block-registry` — it's the source
the block picker, Inspector panel, and canvas rendering logic read from to
know what blocks exist and how to edit them. `apps/public-site`
deliberately does **not** depend on this package (see the "What this
package is not" section above); `apps/api` has no reason to. `libs/shared-types`
duplicates only the pure-data pieces (`BLOCK_STYLE_DEFAULTS`, the props
schemas) that both this package and `apps/public-site` need, precisely so
neither app needs to depend on the other's side of that boundary.

## Running unit tests

Run `nx test block-registry` to execute the unit tests via [Vitest](https://vitest.dev/).
