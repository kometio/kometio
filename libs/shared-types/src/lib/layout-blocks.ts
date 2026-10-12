import { z } from 'zod';
import type { Block } from './block';
import { defineBlockContract } from './block-contract';
import { asString } from './search-prose';

export const columnSpanSchema = z.number().int().min(1).max(12);

export const columnPropsSchema = z.object({
  span: columnSpanSchema.optional(),
});
export type ColumnProps = z.infer<typeof columnPropsSchema>;
export const columnBlockContract = defineBlockContract({
  type: 'Column',
  props: columnPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1rem',
  },
  search: {
    none: "a container: its words are its children's, which index themselves",
  },
});

/** The number of tracks the grid is divided into — see `columnSpanSchema`. */
export const COLUMN_GRID_TRACKS = 12;

/**
 * When a row of columns stops being a row and becomes a stack.
 *
 * `mobile` is the default because it is what the old fixed
 * `@media (max-width: 640px)` did: columns became one column on a phone,
 * always, with no way to ask for anything else. Now a two-column layout
 * that still reads fine on a tablet can say so, and a row of small cards
 * can refuse to stack at all.
 */
export const columnsStackBelowSchema = z.enum(['never', 'tablet', 'mobile']);
export type ColumnsStackBelow = z.infer<typeof columnsStackBelowSchema>;

/** How columns of unequal height line up against each other. */
export const columnsVerticalAlignSchema = z.enum([
  'stretch',
  'start',
  'center',
  'end',
]);
export type ColumnsVerticalAlign = z.infer<typeof columnsVerticalAlignSchema>;

export const columnsPropsSchema = z.object({
  stackBelow: columnsStackBelowSchema.default('mobile'),
  verticalAlign: columnsVerticalAlignSchema.default('stretch'),
});
export type ColumnsProps = z.infer<typeof columnsPropsSchema>;
export const columnsBlockContract = defineBlockContract({
  type: 'Columns',
  props: columnsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    // The space between columns, which used to be a hardcoded 1.5rem
    // (ADR-0050) — this is that same value, so a row nobody has touched
    // looks exactly as it did.
    gap: '1.5rem',
  },
  search: {
    none: "a container: its words are its children's, which index themselves",
  },
});

/**
 * One grid track per column, in order — the value
 * `grid-template-columns` is built from.
 *
 * A column with an explicit `span` gets it. The rest divide what is left
 * of the twelve equally, so "one column at 4, the other untouched" reads
 * as 4 and 8 rather than 4 and some arbitrary default. Nothing here has to
 * add up to twelve: the tracks are emitted as `fr`, which normalises
 * whatever it is given, so an over-committed row compresses instead of
 * overflowing its container — the failure this shape exists to make
 * impossible.
 */
export function resolveColumnSpans(children: Block[] | undefined): number[] {
  const columns = children ?? [];
  if (columns.length === 0) {
    return [];
  }
  const explicit = columns.map((child) => {
    // `safeParse().data` rather than a cast: the schema already narrows
    // the value to a number in the 1..12 range, and re-asserting what it
    // just proved would be trusting the annotation over the check.
    const parsed = columnSpanSchema.safeParse(child.props.span);
    return parsed.success ? parsed.data : null;
  });
  const claimed = explicit.reduce<number>((sum, span) => sum + (span ?? 0), 0);
  const implicitCount = explicit.filter((span) => span === null).length;
  // At least 1: a row whose explicit columns already claim everything
  // still has to give the others a track, or they would collapse to
  // nothing and their content would vanish.
  const share =
    implicitCount > 0
      ? Math.max(1, Math.floor((COLUMN_GRID_TRACKS - claimed) / implicitCount))
      : 0;
  return explicit.map((span) => span ?? share);
}

/** `grid-template-columns` for a row of columns — see `resolveColumnSpans`. */
export function columnsGridTemplate(spans: number[]): string {
  return spans.map((span) => `${span}fr`).join(' ');
}

/**
 * Generic grouping wrapper — the "Container/Sezione" from the original MVP
 * block list (piano-progetto-astro-cms.md) that never actually got built.
 * Unlike Column, its `children` slot is unrestricted (no `allow` list in
 * container.block.tsx): any block, including a nested Container or
 * Columns, can go inside. `background`/`padding` are theme-token-driven
 * (docs/adr/0021) — `primary`/`secondary` here follow the same convention
 * as everywhere else in the design system: primary is the CTA/accent
 * color (Button's own default `variant`, the global link color), muted/
 * secondary is supporting chrome (Card-like backgrounds, subtle
 * separation), never body copy or large surfaces on their own.
 */
export const containerBackgroundSchema = z.enum([
  'none',
  'muted',
  'primary',
  'secondary',
]);
export type ContainerBackground = z.infer<typeof containerBackgroundSchema>;

export const containerPaddingSchema = z.enum(['none', 'sm', 'md', 'lg']);
export type ContainerPadding = z.infer<typeof containerPaddingSchema>;

export const containerPropsSchema = z.object({
  background: containerBackgroundSchema.default('none'),
  padding: containerPaddingSchema.default('md'),
});
export type ContainerProps = z.infer<typeof containerPropsSchema>;
export const containerBlockContract = defineBlockContract({
  type: 'Container',
  props: containerPropsSchema,
  style: {
    // The preset's own value at the block's default (`padding: 'md'`) and
    // `background: 'none'` — the editor opens showing what a Container
    // actually looks like now, and the preset stays the fallback these
    // free values sit in front of (ADR-0050).
    backgroundColor: 'transparent',
    paddingX: '2rem',
    paddingY: '2rem',
    flexDirection: 'column',
    textColor: 'inherit',
    borderRadius: '0.5rem',
    // Each one is the fallback the block's own CSS already declares, so
    // the editor opens showing what the container looks like right now
    // rather than an empty box (ADR-0022's follow-up).
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    backgroundImage: 'none',
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    overlayColor: 'transparent',
    minHeight: 'auto',
    maxWidth: 'none',
    gap: '1rem',
    contentAlign: 'stretch',
    contentJustify: 'flex-start',
  },
  search: {
    none: "a container: its words are its children's, which index themselves",
  },
});

/** A single question/answer pair — always a child of Accordion, rendered as `<details>/<summary>` (Accordion.astro), no JS needed for the open/close behavior itself. */
export const accordionItemPropsSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type AccordionItemProps = z.infer<typeof accordionItemPropsSchema>;
export const accordionItemBlockContract = defineBlockContract({
  type: 'AccordionItem',
  props: accordionItemPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0.75rem',
  },
  search: (props) => [asString(props['question']), asString(props['answer'])],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (AccordionItem only). */
export const accordionPropsSchema = z.strictObject({});
export type AccordionProps = z.infer<typeof accordionPropsSchema>;
export const accordionBlockContract = defineBlockContract({
  type: 'Accordion',
  props: accordionPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: "a container: its words are its children's, which index themselves",
  },
});

/** A single tab — its own `label` plus a nested slot of generic content (unlike AccordionItem, a tab panel can hold arbitrary blocks, not just text). Always a child of Tabs. */
export const tabPropsSchema = z.object({
  label: z.string(),
});
export type TabProps = z.infer<typeof tabPropsSchema>;
export const tabBlockContract = defineBlockContract({
  type: 'Tab',
  props: tabPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '1rem',
  },
  search: (props) => [asString(props['label'])],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Tab only). */
export const tabsPropsSchema = z.strictObject({});
export type TabsProps = z.infer<typeof tabsPropsSchema>;
export const tabsBlockContract = defineBlockContract({
  type: 'Tabs',
  props: tabsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: "a container: its words are its children's, which index themselves",
  },
});

/** Every block this file declares, in the order the picker draws them. */
export const LAYOUT_BLOCK_CONTRACTS = [
  columnsBlockContract,
  containerBlockContract,
  accordionBlockContract,
  accordionItemBlockContract,
  tabsBlockContract,
  tabBlockContract,
  columnBlockContract,
] as const;
