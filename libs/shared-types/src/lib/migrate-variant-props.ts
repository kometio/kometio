import type { Block, PageContent } from './content-model';
import { blockVariantNameSchema } from './site-theme-tokens';

/**
 * The props that used to carry a block's LOOK, and now belong on
 * `Block.variant` (ADR-0047).
 *
 * One entry, and that is the point rather than an oversight: of the three
 * props that emit a modifier class today, only this one is presentation.
 * `Callout.tone` and `PricingPlan.highlighted` stay props because they
 * are meaning — a warning callout is a warning under any theme, and which
 * plan is recommended is a commercial fact, not a design choice a theme
 * may hide.
 */
const VARIANT_PROPS: Readonly<Record<string, string>> = {
  Button: 'variant',
};

/**
 * Moves those props onto `Block.variant`, dropping the prop.
 *
 * `declaredVariants` is the descriptor's own list, per block type, and a
 * stored value outside it is dropped rather than carried over. That is
 * what retires `Button`'s old `'primary'`: it named the DEFAULT look, not
 * a variant, so absent is exactly what it meant — and the same rule
 * refuses a hand-edited value that would otherwise reach a selector
 * without ever passing through the editor.
 *
 * Passed in rather than read from the block registry, which sits ABOVE
 * this library and cannot be imported from it.
 *
 * `changed` reports whether anything moved, so a row already migrated is
 * not rewritten and the script stays safe to re-run.
 */
export function migrateVariantProps(
  content: PageContent,
  declaredVariants: Readonly<Record<string, readonly string[]>>,
): {
  content: PageContent;
  changed: boolean;
} {
  let changed = false;

  function migrateBlock(block: Block): Block {
    const children = block.children?.map(migrateBlock);
    const childrenChanged =
      children !== undefined &&
      children.some((child, index) => child !== block.children?.[index]);

    const propKey = VARIANT_PROPS[block.type];
    const hasProp = propKey !== undefined && propKey in block.props;

    if (!hasProp && !childrenChanged) {
      return block;
    }
    changed = true;

    const props = { ...block.props };
    let variant = block.variant;
    if (hasProp) {
      const value = props[propKey];
      delete props[propKey];
      if (variant === undefined && typeof value === 'string') {
        const declared = declaredVariants[block.type] ?? [];
        const parsed = blockVariantNameSchema.safeParse(value);
        if (parsed.success && declared.includes(parsed.data)) {
          variant = parsed.data;
        }
      }
    }

    return {
      ...block,
      props,
      ...(variant !== undefined ? { variant } : {}),
      ...(children ? { children } : {}),
    };
  }

  return { content: content.map(migrateBlock), changed };
}
