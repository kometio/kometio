import { BLOCK_TYPES, BLOCK_VARIANTS } from '@kometio/shared-types';

/**
 * Every block type Kometio core ships (docs/adr/0041). A theme's own
 * `.block.ts` must not reuse one of these names — a collision would make
 * the theme's block shadow a core one in the editor's picker, which is an
 * override's job (`blocks/<Name>.astro`), not a new type's.
 *
 * It is the list of the blocks' contracts in `@kometio/shared-types`
 * (ADR-0115), not a copy of it: this was a literal list kept by hand, on the
 * ground that a theme built outside this monorepo has this SDK and not the
 * registry. It still has this SDK and not the registry — and `shared-types`,
 * which this SDK already depends on and which carries no React, is where the
 * list lives. `libs/block-registry`'s `core-block-types.spec.ts` still holds
 * the editor's descriptors to it, in both directions.
 */
export const CORE_BLOCK_TYPES: readonly string[] = BLOCK_TYPES;

/**
 * The block types among `candidates` that collide with a core type. Empty
 * means the theme's block set is safe to ship. Kept separate from
 * `validateThemeBlockSet` so a caller can report it distinctly — a
 * collision is a naming mistake, not a malformed descriptor.
 */
export function findCoreBlockTypeCollisions(
  themeBlockTypes: readonly string[],
): string[] {
  const core = new Set(CORE_BLOCK_TYPES);
  return themeBlockTypes.filter((type) => core.has(type));
}

/**
 * The variants each core block type ships, for the same reason as
 * `CORE_BLOCK_TYPES` above: a theme may ADD looks to a core block (ADR-0047),
 * and it must not redeclare one the block already has — that would put the
 * same entry in the picker twice, one of them unreachable.
 *
 * Derived from the contracts, like the list above; only types that actually
 * declare variants appear. Everything else has one look and nothing to
 * collide with. `libs/block-registry`'s spec holds the descriptors' variants
 * to it.
 */
export const CORE_BLOCK_VARIANTS: Readonly<Record<string, readonly string[]>> =
  BLOCK_VARIANTS;
