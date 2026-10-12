import { AUTHOR_BLOCK_CONTRACTS } from './author';
import { COMMERCE_LOCAL_CONTENT_BLOCK_CONTRACTS } from './commerce-local-content-blocks';
import { CONTENT_AND_NAVIGATION_BLOCK_CONTRACTS } from './content-and-navigation-blocks';
import { EMBED_AND_DATA_BLOCK_CONTRACTS } from './embed-and-data-blocks';
import { LAYOUT_BLOCK_CONTRACTS } from './layout-blocks';
import { MARKETING_BLOCK_CONTRACTS } from './marketing-blocks';
import { NAVIGATION_BLOCK_CONTRACTS } from './navigation-blocks';
import { PAGE_LISTING_BLOCK_CONTRACTS } from './page-listing-blocks';
import { REUSABLE_SECTION_BLOCK_CONTRACTS } from './reusable-section';
import { TEXT_AND_MEDIA_BLOCK_CONTRACTS } from './text-and-media-blocks';

/**
 * Every core block type, as the contract of each (ADR-0115): the families'
 * own lists, gathered. A block is declared once, beside its props schema, and
 * named in its family's list; everything else the site, the API and the
 * editor's tooling know about it is derived from here — the schemas
 * (`block-props-schemas.ts`), the style defaults, what search reads, the
 * variants block-sdk lists.
 */
export const BLOCK_CONTRACTS = [
  ...TEXT_AND_MEDIA_BLOCK_CONTRACTS,
  ...NAVIGATION_BLOCK_CONTRACTS,
  ...LAYOUT_BLOCK_CONTRACTS,
  ...MARKETING_BLOCK_CONTRACTS,
  ...PAGE_LISTING_BLOCK_CONTRACTS,
  ...EMBED_AND_DATA_BLOCK_CONTRACTS,
  ...CONTENT_AND_NAVIGATION_BLOCK_CONTRACTS,
  ...COMMERCE_LOCAL_CONTENT_BLOCK_CONTRACTS,
  ...AUTHOR_BLOCK_CONTRACTS,
  ...REUSABLE_SECTION_BLOCK_CONTRACTS,
] as const;

export type BlockContractOf = (typeof BLOCK_CONTRACTS)[number];

/** `{ Hero: <its schema>, … }`, from the contracts: the type is the key, the schema the value. */
export type BlockPropsSchemas = {
  [Contract in BlockContractOf as Contract['type']]: Contract['props'];
};

/**
 * The looks each core block type ships beyond its own, by value — only the
 * types that declare any. What block-sdk offers a theme so that it does not
 * redeclare one (ADR-0047).
 */
export const BLOCK_VARIANTS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    BLOCK_CONTRACTS.flatMap((contract) =>
      'variants' in contract && contract.variants
        ? [[contract.type, contract.variants] as const]
        : [],
    ),
  );
