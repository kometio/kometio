import type { BlockDescriptor } from '@kometio/block-sdk';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import {
  COMPUTED_BLOCK_PROPS,
  type BlockRenderContext,
} from './block-render-context';

/**
 * What BlockRenderer needs to know about a block type to draw it. Worked out
 * from the type's DESCRIPTOR and its component, not written out per type:
 * the table this replaces had an entry for each of 116 types repeating what
 * the descriptor already says (whether it takes a style, whether it holds
 * blocks) beside the import of its component.
 */
export interface BlockDispatchEntry {
  component: AstroComponentFactory;
  /**
   * A theme's own block type only: a core type's schema is the shared
   * `BLOCK_PROPS_SCHEMAS` entry, so it is written once, where the API can
   * read it too. `safeParse`, not `parse`: a block whose saved props no
   * longer match is skipped on its own, never at the cost of the rest of
   * the page. Structural rather than `z.ZodType` so a theme's block, whose
   * schema is its own copy of zod, satisfies it too.
   */
  schema?: {
    safeParse: (
      props: unknown,
    ) =>
      | { success: true; data: Record<string, unknown> }
      | { success: false; error: { issues: unknown } };
  };
  /** The block accepts per-instance styling, so it is handed the class its generated CSS rule targets. The override itself never reaches the component: since ADR-0047 it is a stylesheet rule, not an inline attribute. */
  stylable?: boolean;
  /** Recurses into `block.children` — true for Nav/NavDropdown/HamburgerMenu/Tab too, which however do NOT receive `hasChildren` (they are not "slot" containers in the same sense). */
  recurseChildren?: boolean;
  /** Real containers only (Columns/Container/Accordion/etc.) — they also receive `hasChildren` and the label of the only block they take, on top of recursing into their children. */
  containerProps?: boolean;
  /** What is computed for this type besides its own props. */
  extra?: (context: BlockRenderContext) => Record<string, unknown>;
}

/**
 * Its children arrive from the section, not from the page tree — they are
 * grafted on at read time by resolveSectionBlocks (docs/adr/0059) — so a
 * Section is not `isContainer` and is drawn as one.
 */
const GRAFTED_CHILDREN: ReadonlySet<string> = new Set(['Section']);

/**
 * Containers whose children are structure — menu entries, a tab's panel —
 * and not a slot with an "add a block here" placeholder, so they recurse
 * but are not handed `hasChildren`.
 */
const STRUCTURAL_CONTAINERS: ReadonlySet<string> = new Set([
  'Nav',
  'HamburgerMenu',
  'NavDropdown',
  'Tab',
]);

function childrenAsItems(context: BlockRenderContext) {
  return { items: context.block.children ?? [] };
}

/**
 * The dispatch entry of each core block type, from its descriptor and the
 * component named for it. A descriptor with no component is an error here,
 * at startup, and not a page that quietly renders nothing for that block.
 */
export function coreDispatchEntries(
  descriptors: readonly BlockDescriptor[],
  componentOf: (type: string) => AstroComponentFactory | undefined,
): Record<string, BlockDispatchEntry> {
  const entries: Record<string, BlockDispatchEntry> = {};
  for (const descriptor of descriptors) {
    const { type } = descriptor;
    const component = componentOf(type);
    if (!component) {
      throw new Error(
        `Block type "${type}" is registered but has no components/blocks/${type}.astro.`,
      );
    }
    const isSlotContainer =
      GRAFTED_CHILDREN.has(type) ||
      (descriptor.isContainer === true && !STRUCTURAL_CONTAINERS.has(type));
    entries[type] = {
      component,
      stylable: (descriptor.stylableProperties?.length ?? 0) > 0,
      recurseChildren:
        descriptor.isContainer === true || GRAFTED_CHILDREN.has(type),
      containerProps: isSlotContainer,
      extra:
        COMPUTED_BLOCK_PROPS[type] ??
        (descriptor.rendersFromChildren ? childrenAsItems : undefined),
    };
  }
  return entries;
}
