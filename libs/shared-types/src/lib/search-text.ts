import type { Block, PageContent, SeoMeta } from './content-model';
import { BLOCK_CONTRACTS } from './block-contracts';
import type { ProseFieldExtractor } from './search-prose';
import { eachBlock } from './block-tree';

/**
 * Builds the plain-text blob a SearchPort adapter indexes for a page —
 * kept here (not in the adapter) because only this package already knows
 * every block type's shape (content-model.ts), and extraction has nothing
 * Postgres-specific about it: a future non-Postgres SearchPort adapter
 * reuses this exact function, only the storage/query side differs.
 *
 * Explicit per-block-type allowlist of "prose" fields, not "grab every
 * string prop generically": most blocks also carry non-prose string props
 * (urls, hex colors, enum values like linkType/variant/layout) that would
 * otherwise pollute the index and produce false-positive matches (e.g.
 * searching "primary" matching every Button block).
 *
 * The allowlist is each block's own `search` on its contract (ADR-0115),
 * and it is a required field: a block declares the extractor that returns
 * its prose or the reason it has none, so forgetting one is a compile
 * error rather than the silent gap Heading shipped with (2026-09-01) —
 * this file used to be a plain `switch` with a `default: return []`, which
 * is exactly what let that happen unnoticed. `block-contracts.spec.ts`
 * holds that the two derived lists below account for every block type, once.
 */
export function extractSearchableText(
  seoMeta: SeoMeta,
  blocks: PageContent,
): string {
  const parts = [seoMeta.title, seoMeta.description];
  collectBlockText(blocks, parts);
  return parts.filter((part) => part.trim().length > 0).join(' ');
}

function collectBlockText(blocks: PageContent, parts: string[]): void {
  for (const block of eachBlock(blocks)) {
    parts.push(...proseFieldsFor(block));
  }
}

/**
 * What search reads of each block that has prose of its own, from the
 * blocks' contracts (ADR-0115): each says, beside its schema, which of its
 * props are words and which are urls, colours and enum values.
 */
const PROSE_FIELD_EXTRACTORS: Partial<Record<string, ProseFieldExtractor>> =
  Object.fromEntries(
    BLOCK_CONTRACTS.flatMap((contract) =>
      typeof contract.search === 'function'
        ? [[contract.type, contract.search] as const]
        : [],
    ),
  );

function proseFieldsFor(block: Block): string[] {
  return PROSE_FIELD_EXTRACTORS[block.type]?.(block.props) ?? [];
}

/** The authoritative "which types does search actually index" list — see `config.spec.ts`'s coverage check. */
export const SEARCHABLE_BLOCK_TYPES = Object.keys(PROSE_FIELD_EXTRACTORS);

/**
 * Every block type that has no prose of its own, each with the reason on its
 * contract (`search: { none: '…' }`). Declaring one is required: a block that
 * is neither is a type error, which is what the 2026-09-01 Heading was not.
 */
export const BLOCKS_WITHOUT_SEARCHABLE_TEXT: readonly string[] =
  BLOCK_CONTRACTS.filter(
    (contract) => typeof contract.search !== 'function',
  ).map((contract) => contract.type);
