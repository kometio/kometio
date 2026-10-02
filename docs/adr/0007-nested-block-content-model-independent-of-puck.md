# 0007 — Nested `Block` content model, independent of Puck's data format

**Status**: Accepted — 2026-08-17

## Context

Puck's own data model is `{ root: {props}, content: ComponentData[], zones?: {...} }`,
with nested drop-zones (`zones`, deprecated in favor of `slot` fields in
recent Puck versions) for container-style blocks — a two-column layout where
each column is independently editable, for example. Kometio's own content
model, `PageContent = Block[]` (`libs/shared-types`), is a flat array with no
nesting concept.

Two options considered when this came up: adopt Puck's native format as
`PageContent` directly (simpler integration, native nesting, but couples the
domain model and the already-migrated Postgres schema to a third-party
library's internal format — see the fuller trade-off discussion the user and
Claude worked through, not reproduced here); or keep `Block[]` flat and give
up nesting entirely. Neither was accepted: the first re-introduces exactly
the coupling Ports & Adapters is meant to prevent (and risks having to
migrate real customers' stored page data if Puck's format ever changes
again — it already has once, `@measured/puck` → `@puckeditor/core`); the
second gives up real capability (container/layout blocks) for no reason.

## Decision

`Block` gains its own optional nesting field, independent of Puck's
vocabulary:

```ts
interface Block {
  type: string;
  props: Record<string, unknown>;
  children?: Block[];
}
```

Puck stays fully isolated inside `editor-app` (per the existing Ports &
Adapters boundary): a mapping layer converts Puck's `Data`
(root/content/zones) to/from `Block[]` with `children`, so a future
container-style block can use Puck's zone mechanism in the editor while
Kometio's own stored format, domain entities, and Postgres schema never
mention Puck at all.

Because `pages.content`/`published_content` are `jsonb` columns with no
Postgres-level schema (the shape is enforced only by our Zod/TypeScript
layer, not the database), adding `children` costs **zero** database
migration — pure application-level type change.

Mitigations for the mapping layer's own risk (not "how do we get Puck's
guarantees for free", there's no shortcut here — a real translation exists
either way):

- Zod-validate both directions at the boundary, same pattern used everywhere
  else in the project before data touches the domain.
- A round-trip test (`Block[]` → Puck `Data` → `Block[]`, same tree back) once
  the mapper is built in `editor-app`, to catch asymmetric bugs a
  one-direction test would miss.

## Consequences

- No blocks in the Phase 2 MVP list currently use `children` — this is
  forward-compatible schema design, not scope creep; it costs one optional
  field today so a container/layout block doesn't require a data migration
  later, once real pages exist.
- The Puck ↔ `Block[]` mapping layer in `editor-app` is now responsible for
  preserving nesting fidelity, not just flat block lists — slightly more
  surface area for that module, mitigated as above.
- Any consumer of page content that isn't the editor (the Astro-native
  renderer, the future WordPress importer in Phase 7) can walk `children`
  directly without knowing anything about Puck's zone mechanism.
