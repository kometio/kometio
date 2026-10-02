import type { Block, PageContent } from './content-model';

/**
 * The three `Columns.layout` presets that ADR-0050 replaced, as the column
 * widths they used to produce.
 *
 * Two of them need no conversion in principle — equal columns are what a
 * row with no widths at all does now — but they are written out anyway:
 * a row migrated to explicit spans keeps its shape when somebody later
 * adds a third column, where an implicit row would silently re-divide
 * itself. Preserving what a page looks like beats keeping its data tidy.
 *
 * `two-asymmetric` is the one that could not survive on defaults: it was
 * `3fr 7fr`, a 30/70 split, and it is the reason this migration exists at
 * all. Twelfths cannot express 30/70 exactly (3.6/8.4), so 4/8 is the
 * nearest the new vocabulary has — a visible but small change, against
 * the alternative of the row silently becoming 50/50.
 */
const LAYOUT_SPANS: Readonly<Record<string, readonly number[]>> = {
  'two-equal': [6, 6],
  'two-asymmetric': [4, 8],
  'three-equal': [4, 4, 4],
};

/**
 * Rewrites `Columns.layout` into a `span` on each child column.
 *
 * Idempotent by construction: the prop is dropped as it is read, so a row
 * already migrated has nothing to match on and `changed` stays false —
 * the script is safe to re-run, and a row it did not touch is not
 * rewritten.
 *
 * A column that already carries its own `span` keeps it: a value someone
 * set by hand is a decision, and the preset it sat under was only ever
 * the fallback.
 */
export function migrateColumnsLayout(content: PageContent): {
  content: PageContent;
  changed: boolean;
} {
  let changed = false;

  function migrateBlock(block: Block): Block {
    const children = block.children?.map(migrateBlock);
    const next: Block = children ? { ...block, children } : { ...block };

    if (next.type !== 'Columns') {
      return next;
    }
    const { layout, ...rest } = next.props as { layout?: unknown };
    // `hasOwn`, not `in`: a layout named `constructor` is not a preset.
    const spans =
      typeof layout === 'string' && Object.hasOwn(LAYOUT_SPANS, layout)
        ? LAYOUT_SPANS[layout]
        : undefined;
    if (spans === undefined) {
      return next;
    }
    changed = true;
    return {
      ...next,
      props: rest,
      // Only as many columns as the preset described: a row that already
      // had more children than its layout had tracks was relying on the
      // grid wrapping them, and giving the extras a width would change
      // where they land.
      children: next.children?.map((child, index) =>
        child.type === 'Column' &&
        index < spans.length &&
        child.props.span === undefined
          ? { ...child, props: { ...child.props, span: spans[index] } }
          : child,
      ),
    };
  }

  return { content: content.map(migrateBlock), changed };
}
