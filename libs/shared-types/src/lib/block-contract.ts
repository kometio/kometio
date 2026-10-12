import type { z } from 'zod';
import type { BlockStyleDefaults } from './site-theme-tokens';
import type { ProseFieldExtractor } from './search-prose';

/**
 * How search reads a block: the extractor that returns its prose, or the
 * reason — in words, because forgetting is how Heading shipped unindexed — it
 * has none of its own.
 */
export type BlockSearchText = ProseFieldExtractor | { none: string };

/**
 * What the site, the API and the editor's tooling share about ONE core block
 * type, in one place beside its props schema (ADR-0115).
 *
 * Each of these used to be a list somewhere else keyed by the type's name —
 * `BLOCK_PROPS_SCHEMAS`, `BLOCK_STYLE_DEFAULTS`, the search extractors and
 * their list of exclusions, the variants block-sdk copies — and a block
 * missing from one was found by a spec, after the fact. Here a field that is
 * required is a decision the compiler asks for, and the lists are derived
 * from the contracts (`block-contracts.ts`, `block-props-schemas.ts`).
 *
 * What the EDITOR needs about a block (its fields, icon, category) is not
 * here: it is React-adjacent and lives in `@kometio/block-registry`, which
 * the public site must not import.
 */
export interface BlockContract<
  Type extends string = string,
  Schema extends z.ZodType = z.ZodType,
> {
  /** The block's type name: `Hero`, `Countdown`. */
  readonly type: Type;
  /** The shape of its props — what a saved block is validated against, by the site and the API. */
  readonly props: Schema;
  /**
   * What its component falls back to for each stylable property
   * (docs/adr/0022), copied from the CSS it already has. Absent for a block
   * that takes no style.
   */
  readonly style?: BlockStyleDefaults;
  /** The prose search indexes for it, or why it has none. */
  readonly search: BlockSearchText;
  /** The looks it ships beyond its own (ADR-0047), by value. A theme may add looks; it may not redeclare these. */
  readonly variants?: readonly string[];
}

/** Identity, with the type name and the schema kept as the literals they are. */
export function defineBlockContract<
  const Type extends string,
  Schema extends z.ZodType,
>(contract: BlockContract<Type, Schema>): BlockContract<Type, Schema> {
  return contract;
}

/** The props of a block, as its contract's schema reads them. */
export type BlockContractProps<Contract extends BlockContract> = z.infer<
  Contract['props']
>;
