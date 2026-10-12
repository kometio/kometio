import { describe, expect, it } from 'vitest';
import { CORE_BLOCK_TYPES, CORE_BLOCK_VARIANTS } from '@kometio/block-sdk';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

/**
 * The guard between the registry and the blocks' contracts
 * (`@kometio/shared-types`, ADR-0115) — which is what block-sdk's
 * `CORE_BLOCK_TYPES` now is.
 *
 * Block-sdk can read the contracts, because it already depends on
 * `shared-types` and a theme built outside this monorepo has both; it
 * cannot read this registry, which is React plus editor UI (ADR-0037 fixed
 * that dependency direction deliberately). So the list is derived from the
 * contracts, and what is left to hold is that the descriptors the editor
 * offers and the contracts the site and the API validate against name the
 * same blocks: a descriptor without a contract is a block the picker offers
 * and the site cannot check; a contract without a descriptor is a block
 * nobody can insert.
 *
 * This file is the one place in the workspace allowed to know both, and
 * it fails naming precisely what to add or remove.
 */
describe('CORE_BLOCK_TYPES', () => {
  it('matches the registry exactly', () => {
    const actual = [
      ...new Set([...pageBlocks, ...headerFooterBlocks].map((b) => b.type)),
    ].sort();

    expect(
      [...CORE_BLOCK_TYPES].sort(),
      "the registry and the blocks' contracts (libs/shared-types) name different block types — a descriptor needs a defineBlockContract beside its schema, or a contract needs a descriptor; the diff shows which",
    ).toEqual(actual);
  });
});

/**
 * The same guard for the variant map. It exists so a theme can check it
 * is not redeclaring a look core already ships (ADR-0047) without
 * depending on this package — and the moment someone gives a core block
 * its first variant is exactly the moment they would forget to give its
 * contract the same list.
 */
describe('CORE_BLOCK_VARIANTS', () => {
  it('matches the registry exactly', () => {
    const actual = Object.fromEntries(
      [...pageBlocks, ...headerFooterBlocks]
        .filter((block) => block.variants?.length)
        .map((block) => [
          block.type,
          (block.variants ?? []).map((variant) => variant.value).sort(),
        ]),
    );

    const declared = Object.fromEntries(
      Object.entries(CORE_BLOCK_VARIANTS).map(([type, variants]) => [
        type,
        [...variants].sort(),
      ]),
    );

    expect(
      declared,
      "the registry's variants and the blocks' contracts (libs/shared-types) differ — add or remove the `variants` of the contract, or the descriptor's, as the diff shows",
    ).toEqual(actual);
  });
});
