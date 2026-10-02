# block-sdk

The public surface for authoring a Kometio block — first-party or third-party.
`defineBlock()` is a validated factory for a `BlockDescriptor`, the same
plain-data shape every one of `libs/block-registry`'s ~50 blocks already
returns (see that package's own README). This package exists so a block
author only needs `@kometio/block-sdk` — not `@kometio/block-registry`, which
also happens to contain the implementation of every core block.

## Why a separate package, not just a function in `block-registry`

Importing from a package that also contains all the first-party blocks
blurs "this is the stable extension contract" with "this is Kometio's
internal implementation" — a real design fork, decided with the project
author 2026-09-01 (see
[ADR-0037](../../docs/adr/0037-block-sdk-third-party-block-extensions.md)).

The dependency direction follows from that choice: `block-registry` depends
on `block-sdk` for the `BlockDescriptor`/`FieldDescriptor` type contract
(re-exported from its own `field-types.ts` so none of its ~50 existing
`*.block.ts` files needed to change), not the other way around — `block-sdk`
(the public surface) can't depend on `block-registry` (built against that
surface) without a circular dependency.

## `defineBlock()`

```ts
import { defineBlock } from '@kometio/block-sdk';
import { z } from 'zod';

const calloutSchema = z.object({
  message: z.string(),
  tone: z.enum(['info', 'warning', 'success']),
});

export const calloutBlock = defineBlock({
  type: 'Callout',
  label: 'blocks.callout.label',
  category: 'content',
  schema: calloutSchema,
  defaultProps: { message: 'Your message here', tone: 'info' },
  fields: [
    {
      kind: 'textarea',
      key: 'message',
      translatable: true,
      label: 'blocks.callout.fields.message.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'select',
      key: 'tone',
      label: 'blocks.callout.fields.tone.fieldLabel',
      options: [
        { label: 'blocks.callout.fields.tone.options.info', value: 'info' },
        {
          label: 'blocks.callout.fields.tone.options.warning',
          value: 'warning',
        },
        {
          label: 'blocks.callout.fields.tone.options.success',
          value: 'success',
        },
      ],
    },
  ],
});
```

`schema` is a required Zod schema — the single source of truth `defaultProps`
is checked against, consistent with this project's existing "a Zod schema is
the source of truth" precedent
([ADR-0026](../../docs/adr/0026-shared-zod-schemas-for-api-response-shapes.md)).
`defineBlock()` calls `schema.parse(defaultProps)` the moment the module
loads: a typo'd or missing default fails immediately and loudly at import
time, not silently at first render. The schema itself is **not** stored on
the returned `BlockDescriptor` — that type has no such field — you pass the
same schema again, separately, when you register your render component (see
below). `type`/`label`/`category`/`fields`/`isContainer`/`allowedChildTypes`/
`stylableProperties`/`defaultStyle` are documented in `block-registry`'s own
README (the `BlockDescriptor`/`FieldDescriptor` shapes now live here, in this
package's `field-types.ts`, but the documentation of what each field means
stays there to avoid duplicating it in two READMEs).

## What `defineBlock()` deliberately does NOT do

`defineBlock()` alone cannot unify block _registration_ into one call —
a block's render component is a separate Astro file, and Kometio's
distribution model is build-time-only — one Docker image per deployment,
no runtime plugin loading
([ADR-0021](../../docs/adr/0021-site-theming-filesystem-packages-and-style-settings.md),
[ADR-0032](../../docs/adr/0032-one-container-per-site-deployment-unit.md)).
Adding a **core** block (inside `libs/block-registry`) still means a
rebuild and still means touching the fixed set of places the walk-through
below lists. But if what you actually want is to add a block _without_
touching any of those core files at all — the common case for a theme,
including Kometio's own `themes/docs-showcase` — see "Adding a block from a
theme, without touching core" below instead: that path exists precisely
so you don't need this section.

### The full registration walk-through (worked example: `Callout`, a core block)

`libs/block-registry/src/lib/blocks/callout.block.ts` is a real, live block
built with `defineBlock()` — not a standalone, unregistered sample — so you
can trace every step against actual code instead of a hypothetical. To add
a block of your own, in order:

1. **Schema** — a `z.object({...})` + inferred type, in
   `libs/shared-types/src/lib/content-model.ts` (see `calloutPropsSchema`),
   and its entry in `BLOCK_PROPS_SCHEMAS`
   (`libs/shared-types/src/lib/block-props-schemas.ts`), which is what the
   API and the site validate a saved block's props against.
2. **Descriptor** — a `.block.ts` file calling `defineBlock()` (see
   `callout.block.ts`), registered in `libs/block-registry/src/lib/config.ts`:
   add the import and add it to the `pageBlocks` array. Its `category` says
   which drawer of the picker it is in, and its place in `pageBlocks` says
   where in that drawer — there is no second list of types to edit. If it
   ships with core, its `type` also goes in `CORE_BLOCK_TYPES`
   (`libs/block-sdk/src/lib/core-block-types.ts`).
3. **Render component** — `apps/public-site/src/components/blocks/<Type>.astro`
   (see `Callout.astro`), named exactly like the `type`. It is found by that
   name: there is no import to add and no dispatch table to extend. It is the
   _only_ renderer for the block; both the public site and the editor's live
   canvas preview use it (the canvas renders inside a sandboxed iframe
   showing this exact same output, not a separate React re-implementation).
   Every block is handed the page's `locale`, `site`, `editable`, ... whether
   it reads them or not, plus `hasChildren` if its descriptor is a container,
   `items` if it `rendersFromChildren`, and the class of its per-instance
   style if it takes one. A block that needs something computed beyond that
   adds an entry to `COMPUTED_BLOCK_PROPS`
   (`apps/public-site/src/lib/block-render-context.ts`). A component that is
   not a block goes in `components/parts/`, not `blocks/`.
4. **Labels** — `blocks.<type>.label` and `blocks.<type>.fields.*` keys in
   `apps/editor-app/src/locales/en.json` and `it.json`.
5. **Style defaults** — if it lists `stylableProperties`, its entry in
   `BLOCK_STYLE_DEFAULTS` (`libs/shared-types/src/lib/block-style-defaults.ts`).
6. **Search text** — `libs/shared-types/src/lib/search-text.ts`: either the
   fields that carry prose, or an explicit exclusion (see its own doc
   comment for why this is an allowlist, not automatic).
7. Optional: an entry in `GENERATION_CATALOG`
   (`libs/application/src/lib/page-generation/generation-catalog.ts`) if a
   page generated from a prompt may use it.

Nothing on that list is left to memory: a step that is missed fails a spec
that names it.

| Declaration                                      | Failing spec                                        |
| ------------------------------------------------ | --------------------------------------------------- |
| props schema, and `defaultProps` that satisfy it | `libs/block-registry/.../block-declaration.spec.ts` |
| `CORE_BLOCK_TYPES`                               | `libs/block-registry/.../core-block-types.spec.ts`  |
| listed in `pageBlocks` / `headerFooterBlocks`    | `libs/block-registry/.../config.spec.ts`            |
| search text or exclusion; style defaults         | `libs/block-registry/.../config.spec.ts`            |
| an icon of its own                               | `libs/block-registry/.../block-icons.spec.ts`       |
| a component named for it                         | `apps/public-site/.../block-components.spec.ts`     |
| a nesting the generation catalogue allows        | `apps/api/.../generation-catalog-registry.spec.ts`  |

## Adding a block from a theme, without touching core

The Extension Manifest ([ADR-0041](../../docs/adr/0041-theme-defined-block-extensions.md))
— referenced above as deferred in ADR-0037, now built. Drop three files
under `themes/<name>/blocks/`, named after the block's own `type`:

```
themes/<name>/blocks/
  Faq.block.ts        # defineBlock() descriptor + the raw schema, re-exported
  Faq.astro             # render component — same file the public site actually renders
  Faq.locales.json      # {"en": {...}, "it": {...}} — what would sit under blocks.faq
```

`Faq.block.ts` exports the `defineBlock()` result as `default`, and the
schema it validated against as a separate named export (`defineBlock()`
still doesn't store the schema on the descriptor):

```ts
import { z } from 'zod';
import { defineBlock } from '@kometio/block-sdk';

const faqPropsSchema = z.object({ question: z.string(), answer: z.string() });

export default defineBlock({
  type: 'Faq',
  label: 'blocks.faq.label',
  category: 'content',
  schema: faqPropsSchema,
  defaultProps: { question: '', answer: '' },
  fields: [
    {
      kind: 'text',
      key: 'question',
      label: 'blocks.faq.fields.question.fieldLabel',
    },
    {
      kind: 'textarea',
      key: 'answer',
      label: 'blocks.faq.fields.answer.fieldLabel',
    },
  ],
});

export { faqPropsSchema as schema };
```

`label`/every field's `label`/every option's `label` must be exactly
`blocks.<type with its first letter lowercased>...` (`Faq` -> `blocks.faq`,
a multi-word type like `StatusBadge` -> `blocks.statusBadge`, same
convention core blocks use) — checked mechanically, not just by
convention: a mismatched key is a validation error, not a silent raw-key
leak in the picker. `Faq.locales.json` supplies the actual English/Italian
text at that same key path:

```json
{
  "en": {
    "label": "FAQ",
    "fields": {
      "question": { "fieldLabel": "Question" },
      "answer": { "fieldLabel": "Answer" }
    }
  },
  "it": {
    "label": "FAQ",
    "fields": {
      "question": { "fieldLabel": "Domanda" },
      "answer": { "fieldLabel": "Risposta" }
    }
  }
}
```

That's it — no edit to `libs/block-registry/src/lib/config.ts`, no edit
to `BlockRenderer.astro`, no edit to `apps/editor-app`'s locale files.
Each theme's own `blocks/blocks.spec.ts` (see
`themes/docs-showcase/blocks/blocks.spec.ts`) runs `validateThemeBlockSet()`
against everything under its `blocks/` folder in CI, on every build,
regardless of which theme is active — the same rules a `.block.ts` file
without a matching core-type collision must pass before it can ship. A
`kind: 'custom'` field (carrying a live React component) isn't supported
here — it can't cross the JSON boundary to `apps/editor-app`, so it fails
validation instead of silently breaking. `themes/README.md` covers the
theme-package side of this (how `blocks/blocks.spec.ts` is wired up);
this section is the block-authoring contract itself.

## Adding a look to a core block, without touching core

A theme that wants its own button styles does **not** add a block type.
It adds **variants** to the one core ships, in
`themes/<name>/blocks/<Type>.variants.ts`:

```ts
import type { ThemeBlockVariant } from '@kometio/block-sdk';

const variants: ThemeBlockVariant[] = [
  { value: 'ghost', label: { en: 'Ghost', it: 'Fantasma' } },
];

export default variants;
```

The CSS for `.kometio-button--ghost` goes in the theme's own stylesheet.
Nothing else is required — the class is built from `Block.variant`, so
the look renders as soon as it is picked.

The helpers here are the same ones the runtime loader uses, so a passing
spec is evidence about the loader and not merely about the spec:

|                                  | what it checks                                   | where it can run                                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `collectThemeVariantExtensions`  | shapes an `import.meta.glob` map into extensions | anywhere                                         |
| `validateThemeVariantExtensions` | names, labels, a theme repeating itself          | anywhere                                         |
| `checkVariantsAgainstCore`       | the type exists; no look core already ships      | needs `CORE_BLOCK_VARIANTS` + `CORE_BLOCK_TYPES` |

Both constants live in this package rather than being derived from
`@kometio/block-registry`, for the reason at the top of this file: that
package is React and editor UI, and depending on it is what used to make
a theme undevelopable outside the monorepo. `block-registry`'s own
`core-block-types.spec.ts` fails, naming what to fix, when either drifts.

## Adding a style property core does not have

Beside variants, a theme can give a block a new **style knob** — a value
the agency tunes from the editor's style panel, for something core has no
property for. `themes/<name>/blocks/<Type>.style.ts`:

```ts
import type { ThemeStyleProperty } from '@kometio/block-sdk';

const properties: ThemeStyleProperty[] = [
  {
    key: 'windowTint',
    control: 'color',
    label: { en: 'Chrome', it: 'Cornice' },
  },
];

export default properties;
```

The theme's CSS reads the variable derived from the key —
`--kometio-override-window-tint` — and never names it itself.

|                                   | what it checks                                   | where it can run         |
| --------------------------------- | ------------------------------------------------ | ------------------------ |
| `collectThemeStyleProperties`     | shapes an `import.meta.glob` map into extensions | anywhere                 |
| `validateThemeStyleProperties`    | keys, controls, labels, a theme repeating itself | anywhere                 |
| `checkStylePropertiesAgainstCore` | the type exists; no key core already ships       | needs `CORE_BLOCK_TYPES` |

`CORE_STYLE_PROPERTY_KEYS` is read from `blockStyleOverrideSchema` itself
rather than repeated, so unlike `CORE_BLOCK_TYPES` it has no anti-drift
spec to keep: it **is** the source.

**Reach for this only when the agency should tune the value.** If it is
the theme's own design decision, write it in CSS — simpler, and nobody
can break it.

## Running unit tests

Run `nx test block-sdk` to execute the unit tests via [Vitest](https://vitest.dev/).
