import type { Block, PageContent } from './content-model';

interface StructureShape {
  type: string;
  children?: StructureShape[];
}

function shapeOfBlock(block: Block): StructureShape {
  return block.children && block.children.length > 0
    ? { type: block.type, children: block.children.map(shapeOfBlock) }
    : { type: block.type };
}

/**
 * A change-detector for a page's block STRUCTURE (types + nesting/order),
 * deliberately blind to prop values/text — two pages with the same blocks
 * in the same shape produce the same signature even if every string prop
 * differs between them, so correcting a typo in the original never counts
 * as "drift" for a translation (see docs/adr for the translation
 * structural-drift indicator). Not a cryptographic hash: a plain
 * `JSON.stringify` of the shape is enough to detect a change, nothing
 * here needs collision-resistance, and it stays trivially inspectable in
 * a debugger.
 */
export function computeContentStructureSignature(content: PageContent): string {
  return JSON.stringify(content.map(shapeOfBlock));
}
