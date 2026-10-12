import { BLOCK_CONTRACTS, type BlockPropsSchemas } from './block-contracts';

/**
 * Every block type Kometio knows, and the schema its props are checked
 * against — the one list both the public site and the API read.
 *
 * It lived only inside the public site's BlockRenderer, next to the Astro
 * component each type renders with, where nothing else could reach it: the
 * API had no way to know which block types exist or what a valid block
 * looks like. Generating a page from a prompt needs exactly that, and so
 * will any block from outside the core. The renderer reads its schema from
 * here, so the two cannot drift apart.
 *
 * Derived from the blocks' contracts (ADR-0115), which declare each one
 * beside its schema: it is not a list to add to. A theme's own block types
 * are not here: their schemas travel with the theme (docs/adr/0021).
 */
// The one cast: TypeScript cannot say that a list of contracts, each with a
// literal `type`, is an object keyed by those literals; `BlockPropsSchemas`
// says it, and `Object.fromEntries` is its runtime.
export const BLOCK_PROPS_SCHEMAS = Object.fromEntries(
  BLOCK_CONTRACTS.map((contract) => [contract.type, contract.props]),
) as BlockPropsSchemas;

export type BlockType = keyof typeof BLOCK_PROPS_SCHEMAS;

export function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(BLOCK_PROPS_SCHEMAS, type);
}

/** Every core block type, in the order the families declare them. */
export const BLOCK_TYPES: readonly BlockType[] =
  Object.keys(BLOCK_PROPS_SCHEMAS).filter(isBlockType);
