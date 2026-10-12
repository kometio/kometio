import { z } from 'zod';
import type { Block } from './block';

export const columnSpanSchema = z.number().int().min(1).max(12);

export const columnPropsSchema = z.object({
  span: columnSpanSchema.optional(),
});
export type ColumnProps = z.infer<typeof columnPropsSchema>;

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

/** A single question/answer pair — always a child of Accordion, rendered as `<details>/<summary>` (Accordion.astro), no JS needed for the open/close behavior itself. */
export const accordionItemPropsSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type AccordionItemProps = z.infer<typeof accordionItemPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (AccordionItem only). */
export const accordionPropsSchema = z.strictObject({});
export type AccordionProps = z.infer<typeof accordionPropsSchema>;

/** A single tab — its own `label` plus a nested slot of generic content (unlike AccordionItem, a tab panel can hold arbitrary blocks, not just text). Always a child of Tabs. */
export const tabPropsSchema = z.object({
  label: z.string(),
});
export type TabProps = z.infer<typeof tabPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Tab only). */
export const tabsPropsSchema = z.strictObject({});
export type TabsProps = z.infer<typeof tabsPropsSchema>;
