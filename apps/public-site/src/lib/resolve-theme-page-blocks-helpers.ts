import type {
  ThemeBlockCandidate,
  ThemeBlockValidationError,
} from '@kometio/block-sdk';
import {
  themeBlockEntrySchema,
  type ThemeBlockEntry,
} from '@kometio/shared-types';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

/**
 * Isolated from the file that calls `import.meta.glob('~theme/...')`
 * (resolve-theme-page-blocks.ts), same reasoning as
 * resolve-theme-block-style-defaults-helpers.ts: pure logic gets a real
 * unit test, the Vite-alias part doesn't (needs the Astro plugin this
 * project's own vitest config doesn't register).
 */

/**
 * A theme block whose `type` collides with an existing core block type
 * would silently shadow or corrupt the dispatch table depending on spread
 * order — checked here rather than inside `@kometio/block-sdk`'s
 * `validateThemeBlockSet()`, which is deliberately core-agnostic (it has
 * no way to know the full core type list without depending on
 * `@kometio/block-registry`, docs/adr/0037's own dependency direction).
 */
export function checkCoreTypeCollisions(
  candidates: ThemeBlockCandidate[],
  coreBlockTypes: readonly string[],
): ThemeBlockValidationError[] {
  const core = new Set(coreBlockTypes);
  return candidates
    .filter((candidate) => core.has(candidate.descriptor.type))
    .map((candidate) => ({
      basename: candidate.basename,
      message: `type "${candidate.descriptor.type}" collides with an existing core block — use "${candidate.descriptor.type}.astro" alone (no matching .block.ts) to override it instead, or pick a different type name to add something new`,
    }));
}

export interface ThemeBlockDispatchEntry {
  component: AstroComponentFactory;
  schema: { parse: (props: unknown) => Record<string, unknown> };
  /** The block accepts per-instance styling, so it is handed the class its generated CSS rule targets. Named for what it does, not for a prop: since ADR-0047 the override itself never reaches the component, only the class. */
  stylable?: boolean;
  recurseChildren?: boolean;
  containerProps?: boolean;
}

/**
 * A theme block gets the same treatment as an ordinary content block —
 * including the page context every block is handed (`locale`, `site`,
 * `translations`, ...; block-render-context.ts). Nothing is computed for it
 * beyond that. `isContainer` maps to the common recurseChildren+containerProps pairing
 * (Columns/Container/Accordion/... already use) — the Nav/Tab-style split
 * (recurseChildren without containerProps) isn't supported for theme
 * blocks in v1, a stated limitation, not a silent gap.
 */
export function buildDispatchEntry(
  descriptor: ThemeBlockCandidate['descriptor'],
  component: AstroComponentFactory,
  schema: { parse: (props: unknown) => Record<string, unknown> },
): ThemeBlockDispatchEntry {
  return {
    component,
    schema,
    stylable: (descriptor.stylableProperties?.length ?? 0) > 0,
    ...(descriptor.isContainer
      ? { recurseChildren: true, containerProps: true }
      : {}),
  };
}

/**
 * The wire shape `GET /api/themes/current/blocks` serves — only called
 * once every candidate has already passed `validateThemeBlockSet()`
 * (which already rejects a `kind:'custom'` field, an unknown category,
 * and a missing locale fragment). `themeBlockEntrySchema.parse()` is what
 * actually narrows `BlockDescriptor`'s wider TS shape (e.g. `FieldDescriptor`
 * still includes the `custom` variant as a logical possibility) down to
 * the wire type — real validation doing the narrowing, not a cast
 * asserting an invariant this function has no local evidence for. Throws
 * if `validateThemeBlockSet()` was skipped or its result ignored — the
 * same "loud at build time" posture as the rest of this loader.
 */
export function buildThemeBlocksResponseEntry(
  candidate: ThemeBlockCandidate,
): ThemeBlockEntry {
  return themeBlockEntrySchema.parse({
    descriptor: candidate.descriptor,
    locales: candidate.locales,
  });
}
