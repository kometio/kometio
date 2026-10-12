import { describe, expect, it } from 'vitest';
import { BLOCK_PROPS_SCHEMAS, isBlockType } from '@kometio/shared-types';
import { CORE_BLOCK_TYPES } from '@kometio/block-sdk';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

/**
 * What a core block has to be declared in, beyond its own descriptor and
 * its component, and the check that fails when one is missing (the
 * walk-through is in libs/block-sdk/README.md):
 *
 * | Declaration                              | Held by                                  |
 * | ---------------------------------------- | ---------------------------------------- |
 * | its contract (`defineBlockContract`)    | the compiler; shared-types' block-contracts.spec.ts |
 * | a contract for each descriptor, and back | core-block-types.spec.ts                 |
 * | props its own defaults satisfy           | this file                                |
 * | listed in `pageBlocks` / header-footer   | config.spec.ts                           |
 * | search text covers the registry's types  | config.spec.ts                           |
 * | style defaults, when it takes a style    | config.spec.ts                           |
 * | a component of its name                  | apps/public-site block-components.spec.ts |
 * | an icon of its own                       | block-icons.spec.ts                      |
 *
 * The props schema was the one nothing held: a type without one is read by
 * the site as "no schema", and its props are rendered unchecked. It is the
 * `props` of the type's contract now, so what is held here is that there is
 * a contract, and that the descriptor's defaults satisfy it.
 */
describe('a core block has a props schema its own defaults satisfy', () => {
  const descriptors = [
    ...new Map(
      [...pageBlocks, ...headerFooterBlocks].map((d) => [d.type, d]),
    ).values(),
  ];

  it('reads the registry it is meant to be checking', () => {
    expect(descriptors.length).toBeGreaterThan(100);
    expect(CORE_BLOCK_TYPES.length).toBe(descriptors.length);
  });

  it.each(descriptors.map((d) => [d.type, d] as const))(
    '%s',
    (type, descriptor) => {
      expect(
        isBlockType(type),
        `${type} has no contract: add a defineBlockContract beside its props schema and name it in its family's *_BLOCK_CONTRACTS list (libs/shared-types/src/lib)`,
      ).toBe(true);
      if (!isBlockType(type)) return;
      const parsed = BLOCK_PROPS_SCHEMAS[type].safeParse(
        descriptor.defaultProps,
      );
      expect(
        parsed.success ? [] : parsed.error.issues,
        `${type}: its defaultProps do not satisfy its own schema`,
      ).toEqual([]);
    },
  );

  it('has no schema for a type that is not a block', () => {
    const registered = new Set(descriptors.map((d) => d.type));

    expect(
      Object.keys(BLOCK_PROPS_SCHEMAS).filter((type) => !registered.has(type)),
    ).toEqual([]);
  });
});
