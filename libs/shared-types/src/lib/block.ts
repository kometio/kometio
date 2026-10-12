import { z } from 'zod';
import {
  blockVariantNameSchema,
  responsiveBlockStyleSchema,
  type ResponsiveBlockStyle,
} from './site-theme-tokens';

/**
 * The generic format of a content block. Each concrete block type (Hero,
 * Text, ...) defines its own schema for `props`; this is the structural
 * shape they share.
 *
 * `children` is our own nesting scheme, independent of any editor
 * library's native format — see docs/adr/0007. Containers are ours to
 * define, and the domain and the database are not coupled to a third
 * party's internal format.
 *
 * `id` is optional in the type because content can arrive without one;
 * `backfillBlockIds` (backfill-block-ids.ts) assigns a stable id to every
 * block that lacks one, never changing one that has it. Selection, dragging
 * and fragment patching use it as the block's identity.
 */
/**
 * The three widths a root-level block can claim (ADR-0049).
 *
 * A closed set, not a free CSS length: `maxWidth` already exists as a
 * per-instance style property for "this one block, this exact number",
 * and it answers a different question. These three are the ones a theme
 * can be designed around — a theme knows what its wide tier looks like,
 * it cannot know what 71.5rem was supposed to mean.
 */
export const blockAlignSchema = z.enum(['content', 'wide', 'full']);
export type BlockAlign = z.infer<typeof blockAlignSchema>;

export interface Block {
  id?: string;
  type: string;
  props: Record<string, unknown>;
  children?: Block[];
  /**
   * Which of the block type's declared variants this block uses
   * (ADR-0047) — `undefined` means the type's own default look.
   *
   * A field of the block, NOT a prop, and the distinction is the point:
   * props are the client's CONTENT and a theme is a view over it
   * (ADR-0048), so a theme may add a variant or hide one it has no design
   * for, and the worst that happens is the block renders in its default
   * look. Had this stayed a prop, a theme dropping a variant would leave
   * content pointing at a value that no longer exists — the failure that
   * ADR-0048 exists to prevent.
   *
   * `Callout.tone` and `PricingPlan.highlighted` deliberately stay props
   * even though they emit a modifier class too: a warning callout is a
   * warning under any theme, and which plan is recommended is a
   * commercial fact. They are meaning, not presentation.
   */
  variant?: string;
  /**
   * How much of the page's width this block claims (ADR-0049) — the
   * WordPress `alignwide`/`alignfull` model. `undefined` means the
   * readable content column, which is what every block got before this
   * field existed.
   *
   * A field of the block for the same reason `variant` is one, plus a
   * second: this is the only one of the three style tiers that a site
   * turning `overridesEnabled` off, or a theme setting
   * `allowStyleOverrides: false`, must NOT be able to collapse. Those two
   * gates mean "show me the theme's own look again" — repainting a block
   * is a look, moving a hero out of the text column and back is the
   * page's structure, and a switch about colour has no business
   * re-flowing the layout. Had this been a `styleOverride` property it
   * would have been gated with the rest of them (PageLayout.astro's
   * `themeAllowsOverrides`), and a bespoke theme would silently pull
   * every full-bleed section back into a 64rem column.
   *
   * Only meaningful on a ROOT-level block: nested blocks are laid out by
   * whatever contains them, so the editor offers the control only at the
   * top level and a value set on a child is ignored by the renderer
   * rather than rejected — old content stays valid either way.
   */
  align?: BlockAlign;
  /**
   * The per-instance override (docs/adr/0022) — THIS block only, on top of
   * any type-level override saved in the site's themeTokens.
   * `undefined`/absent fields = inherit normally.
   *
   * Per breakpoint since ADR-0047: `base` applies at every size and the
   * other two hold only what CHANGES below their width, exactly as the
   * cascade already behaves. A flat override written before then still
   * parses, and still means what it meant.
   */
  styleOverride?: ResponsiveBlockStyle;
}

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(blockSchema).optional(),
    variant: blockVariantNameSchema.optional(),
    align: blockAlignSchema.optional(),
    styleOverride: responsiveBlockStyleSchema.optional(),
  }),
);

export const pageContentSchema = z.array(blockSchema);
export type PageContent = z.infer<typeof pageContentSchema>;

export const seoMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  ogTags: z.record(z.string(), z.string()).optional(),
  canonical: z.string().optional(),
});
export type SeoMeta = z.infer<typeof seoMetaSchema>;
