import { describe, expect, it } from 'vitest';
import { BLOCK_STYLE_DEFAULTS } from './block-style-defaults';
import { BLOCK_CONTRACTS, BLOCK_VARIANTS } from './block-contracts';
import { BLOCK_PROPS_SCHEMAS, BLOCK_TYPES } from './block-props-schemas';
import {
  BLOCKS_WITHOUT_SEARCHABLE_TEXT,
  SEARCHABLE_BLOCK_TYPES,
} from './search-text';

/*
 * The lists the site, the API and the editor's tooling read are derived from
 * the contracts (ADR-0115). What a derivation cannot notice by itself is a
 * contract that never reached it, or two that share a name; those are held
 * here.
 */

const contractTypes = BLOCK_CONTRACTS.map((contract) => contract.type);

describe('BLOCK_CONTRACTS', () => {
  it('names each block type once — a repeated one would shadow the other in every derived list', () => {
    const repeated = contractTypes.filter(
      (type, index) => contractTypes.indexOf(type) !== index,
    );

    expect(repeated).toEqual([]);
  });

  it('holds every contract a family file declares', () => {
    const declared = Object.entries(
      import.meta.glob<Record<string, unknown>>(['./*.ts', '!./*.spec.ts'], {
        eager: true,
      }),
    ).flatMap(([file, module]) =>
      Object.entries(module)
        .filter(
          ([name, value]) =>
            name.endsWith('BlockContract') && typeof value === 'object',
        )
        .map(([name, value]) => ({ file, name, value })),
    );

    expect(declared.length).toBeGreaterThan(0);
    const listed = new Set<unknown>(BLOCK_CONTRACTS);
    const unlisted = declared
      .filter(({ value }) => !listed.has(value))
      .map(({ file, name }) => `${file}: ${name}`);

    expect(unlisted).toEqual([]);
  });

  it('derives the props schemas, one per contract and the contract’s own', () => {
    expect(Object.keys(BLOCK_PROPS_SCHEMAS).sort()).toEqual(
      [...contractTypes].sort(),
    );
    for (const contract of BLOCK_CONTRACTS) {
      expect(BLOCK_PROPS_SCHEMAS[contract.type]).toBe(contract.props);
    }
    expect([...BLOCK_TYPES].sort()).toEqual([...contractTypes].sort());
  });

  it('says for every block what search reads of it, or why it reads nothing', () => {
    const searchable = new Set(SEARCHABLE_BLOCK_TYPES);
    const without = new Set(BLOCKS_WITHOUT_SEARCHABLE_TEXT);

    for (const contract of BLOCK_CONTRACTS) {
      if (typeof contract.search === 'function') {
        expect(searchable.has(contract.type), contract.type).toBe(true);
        expect(without.has(contract.type), contract.type).toBe(false);
      } else {
        expect(contract.search.none.trim(), contract.type).not.toBe('');
        expect(searchable.has(contract.type), contract.type).toBe(false);
        expect(without.has(contract.type), contract.type).toBe(true);
      }
    }
    expect(searchable.size + without.size).toBe(contractTypes.length);
  });

  it('derives the style defaults of the blocks that declare any, and of no other', () => {
    const styled = BLOCK_CONTRACTS.filter(
      (contract) => 'style' in contract && contract.style !== undefined,
    ).map((contract) => contract.type);

    expect(Object.keys(BLOCK_STYLE_DEFAULTS).sort()).toEqual(styled.sort());
  });

  it('derives the variants of the blocks that ship any, and of no other', () => {
    const withVariants = BLOCK_CONTRACTS.filter(
      (contract) => 'variants' in contract && contract.variants !== undefined,
    ).map((contract) => contract.type);

    expect(Object.keys(BLOCK_VARIANTS).sort()).toEqual(withVariants.sort());
    for (const [type, variants] of Object.entries(BLOCK_VARIANTS)) {
      expect(variants.length, type).toBeGreaterThan(0);
      expect(new Set(variants).size, type).toBe(variants.length);
    }
  });
});
