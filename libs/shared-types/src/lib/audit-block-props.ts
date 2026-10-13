import type { z } from 'zod';
import type { PageContent } from './block';
import { eachBlock } from './block-tree';
import { BLOCK_PROPS_SCHEMAS } from './block-props-schemas';

/**
 * A block whose props its type's schema refuses: what the public site would
 * skip (BlockRenderer.astro: the block is not drawn, the log says why, and the
 * person editing is shown a hint).
 */
export interface InvalidBlockProps {
  /** `Block.id`; absent on content older than `backfill-block-ids`. */
  id: string | undefined;
  type: string;
  /** 1-based place in page order (each block before its children), for a block with no id. */
  position: number;
  /** One line per issue: `level: Invalid option: …`. */
  issues: string[];
}

export interface BlockPropsAudit {
  /** Blocks whose props were held to a schema. */
  checked: number;
  /**
   * Blocks of a type this audit has no schema for, counted by type: a theme's
   * own block (its schema travels with the theme, docs/adr/0021) or a type
   * nobody knows. Not a failure — a gap, said out loud. A map, because the
   * type is whatever was stored: `toString` and `__proto__` are names too.
   */
  unchecked: Map<string, number>;
  invalid: InvalidBlockProps[];
}

/**
 * Holds every block's props to the schema of its type, as the public site does
 * when it draws it (`schema.safeParse(block.props)`), so that "does this
 * content render?" has an answer before a visitor asks it.
 *
 * It reads and reports; nothing is rewritten. A page whose blocks fail is
 * still a readable page (the renderer skips the block, not the page), which is
 * why this is an audit and not a gate on the way in or out of the database
 * (docs/adr/0124).
 *
 * `schemas` is the core's by default; a caller that has a theme's blocks
 * passes them added.
 */
export function auditBlockProps(
  content: PageContent,
  schemas: Readonly<Record<string, z.ZodType>> = BLOCK_PROPS_SCHEMAS,
): BlockPropsAudit {
  const audit: BlockPropsAudit = {
    checked: 0,
    unchecked: new Map(),
    invalid: [],
  };
  let position = 0;
  for (const block of eachBlock(content)) {
    position += 1;
    const schema = Object.hasOwn(schemas, block.type)
      ? schemas[block.type]
      : undefined;
    if (!schema) {
      audit.unchecked.set(
        block.type,
        (audit.unchecked.get(block.type) ?? 0) + 1,
      );
      continue;
    }
    audit.checked += 1;
    const parsed = schema.safeParse(block.props);
    if (!parsed.success) {
      audit.invalid.push({
        id: block.id,
        type: block.type,
        position,
        issues: parsed.error.issues.map(
          (issue) =>
            `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
        ),
      });
    }
  }
  return audit;
}
