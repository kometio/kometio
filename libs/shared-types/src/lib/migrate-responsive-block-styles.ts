import type { Block, PageContent } from './content-model';
import {
  normalizeResponsiveBlockStyle,
  type ResponsiveBlockStyle,
} from './site-theme-tokens';

/**
 * Rewrites every `styleOverride` still in the flat, pre-ADR-0047 shape as
 * the per-breakpoint one, leaving everything else exactly as it is.
 *
 * Reading already copes with both shapes — `blockSchema` normalizes on
 * parse, and `normalizeResponsiveBlockStyle` does at the database
 * boundary — so this is not what makes the feature work. It is what stops
 * the two shapes living side by side indefinitely: with both in the
 * tables, every future reader has to remember, every query written against
 * the JSONB has to handle both, and the next person to touch this reads
 * two shapes and cannot tell which is current.
 *
 * `changed` reports whether anything actually moved, so the caller can
 * skip the write — the same contract as `backfillBlockIds`, and what makes
 * this safe to re-run.
 */
export function migrateResponsiveBlockStyles(content: PageContent): {
  content: PageContent;
  changed: boolean;
} {
  let changed = false;

  function migrateBlock(block: Block): Block {
    const children = block.children?.map(migrateBlock);
    const childrenChanged =
      children !== undefined &&
      children.some((child, index) => child !== block.children?.[index]);
    const style = migrateStyle(block.styleOverride);

    if (!style.changed && !childrenChanged) {
      return block;
    }
    changed = true;
    return {
      ...block,
      ...(style.style ? { styleOverride: style.style } : {}),
      ...(children ? { children } : {}),
    };
  }

  return { content: content.map(migrateBlock), changed };
}

/** One override: already per-breakpoint (untouched), flat (rewritten), or absent. */
export function migrateStyle(style: unknown): {
  style: ResponsiveBlockStyle | undefined;
  changed: boolean;
} {
  if (style === undefined || style === null) {
    return { style: undefined, changed: false };
  }
  const alreadyMigrated =
    typeof style === 'object' && !Array.isArray(style) && 'base' in style;
  const normalized = normalizeResponsiveBlockStyle(style);
  return { style: normalized, changed: !alreadyMigrated };
}
