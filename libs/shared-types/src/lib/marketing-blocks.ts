import { z } from 'zod';
import {
  collectionDisplaySchema,
  pickedMediaSchema,
  pickedPageSchema,
} from './block-values';

export const quotePropsSchema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string(),
});
export type QuoteProps = z.infer<typeof quotePropsSchema>;

/**
 * `rating` is a plain 1-5 number, not a wrapper object — the editor's
 * number field enforces the range (min/max/step in rating.block.ts), so
 * the schema only needs to describe the shape.
 */
export const ratingPropsSchema = z.object({
  rating: z.number().min(1).max(5),
  label: z.string(),
});
export type RatingProps = z.infer<typeof ratingPropsSchema>;

/**
 * Shared 5-point star SVG path — every star-rating render (Rating,
 * Testimonial) draws the same star, so the path itself lives here once
 * rather than being retyped per render target. apps/public-site's own
 * Astro components are the only renderer now (docs/adr/0007) — the editor
 * canvas shows that same real Astro output inside an iframe rather than a
 * separate React re-implementation.
 */
export const STAR_ICON_PATH =
  'M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.78L10 14.98l-5.18 2.47.99-5.78-4.19-4.08 5.79-.84L10 1.5z';

/**
 * `targetDate` is a free-form string (an ISO-ish datetime, e.g.
 * "2026-12-31T23:59"), not a branded/refined type — same trade-off as
 * NavLink's `url`: the editor has no date-picker field kind, so this is a
 * plain text field in the editor and the public-site countdown
 * (Countdown.astro) parses it with `new Date(...)` at render time.
 */
export const countdownPropsSchema = z.object({
  targetDate: z.string(),
  label: z.string(),
});
export type CountdownProps = z.infer<typeof countdownPropsSchema>;

/** Reuses NavLink/PromoBar's `linkType`/`page`/`url` shape for the button's destination. Per-instance color/spacing overrides live on `Block.styleOverride` (docs/adr/0022), not here — a block-agnostic mechanism, not a bespoke field per block. */
export const bannerPropsSchema = z.object({
  title: z.string(),
  text: z.string(),
  buttonLabel: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
});
export type BannerProps = z.infer<typeof bannerPropsSchema>;

/** Standalone CTA button — same link shape as Banner/NavLink/PromoBar. Which of the two looks it wears is `Block.variant` (ADR-0047), not a prop: a look is presentation, and a theme may add or hide one without touching stored content. Per-instance color/spacing overrides live on `Block.styleOverride` (docs/adr/0022), not here either. */
/** Button sizes, a closed set: a free length would let a call to action be 4px tall. */
export const buttonSizeSchema = z.enum(['sm', 'md', 'lg']);
export type ButtonSize = z.infer<typeof buttonSizeSchema>;

export const buttonPropsSchema = z.object({
  label: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
  /**
   * An icon beside the label (ADR-0056) — `null` for none. The icon
   * registry is resolved by BlockRenderer, exactly as for NavLink and
   * Feature, so this block never reaches into it.
   */
  icon: z.string().nullable().default(null),
  size: buttonSizeSchema.default('md'),
  /** Full width of whatever holds it — what a button in a narrow column or a mobile CTA needs. */
  fullWidth: z.boolean().default(false),
  /**
   * `target="_blank"` plus the `rel` that has to come with it. A boolean
   * rather than a free `target`: the only value anyone wants is a new
   * tab, and letting it be free means letting it be wrong.
   */
  openInNewTab: z.boolean().default(false),
});
export type ButtonProps = z.infer<typeof buttonPropsSchema>;

/**
 * Plain inline text link — same page/URL targeting as Button, deliberately
 * without variants: a Link isn't a CTA, it renders as ordinary text
 * with the global link treatment (apps/public-site global.css), not a
 * button shape. For "a clickable word inside a sentence", not "a button
 * that happens to look like a link".
 */
export const linkPropsSchema = z.object({
  label: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
});
export type LinkProps = z.infer<typeof linkPropsSchema>;

/** `icon` resolves against the active theme's icon set (docs/adr/0023), same nullable-name pattern as NavLink's own `icon` — `null` = no icon. */
export const featurePropsSchema = z.object({
  icon: z.string().nullable().default(null),
  title: z.string(),
  text: z.string(),
});
export type FeatureProps = z.infer<typeof featurePropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Feature only). */
export const featureGridPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type FeatureGridProps = z.infer<typeof featureGridPropsSchema>;

/**
 * A single testimonial/review card — always a child of Testimonials,
 * rendered as one slide of a scroll-snap carousel (Testimonials.astro),
 * same "container + repeated child, single slot" pattern as
 * Feature/FeatureGrid. `rating` reuses the same 1-5 scale as
 * `ratingPropsSchema` but is its own field: a testimonial's star rating is
 * part of that testimonial, not a standalone Rating block placed beside it.
 */
export const testimonialPropsSchema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string(),
  avatar: pickedMediaSchema.nullable(),
  rating: z.number().min(1).max(5),
});
export type TestimonialProps = z.infer<typeof testimonialPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Testimonial only). */
export const testimonialsPropsSchema = z.strictObject({
  /** ADR-0052 — `slider` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('slider'),
});
export type TestimonialsProps = z.infer<typeof testimonialsPropsSchema>;

/** A single team member card — always a child of Team. */
export const teamMemberPropsSchema = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  photo: pickedMediaSchema.nullable(),
});
export type TeamMemberProps = z.infer<typeof teamMemberPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (TeamMember only). */
export const teamPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type TeamProps = z.infer<typeof teamPropsSchema>;

/**
 * A single pricing plan card — always a child of PricingTable. `price` is a
 * free-form string ("29€", "Su richiesta", ...), not a number — same
 * "editor is trusted to enter it correctly" trade-off as Banner's
 * `backgroundColor`, and a plain number can't represent "Gratis" or "Su
 * richiesta" anyway. `features` is a plain string list, one line per
 * feature — edited via FeatureListField (a textarea split on `\n`), the
 * same problem table-data-field.tsx solved for a 2D matrix, since the
 * editor has no list-of-strings field kind. Reuses NavLink/Banner's
 * `linkType`/`page`/`url` shape for the CTA button's destination.
 */
export const pricingPlanPropsSchema = z.object({
  name: z.string(),
  price: z.string(),
  period: z.string(),
  features: z.array(z.string()),
  highlighted: z.boolean().default(false),
  buttonLabel: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
});
export type PricingPlanProps = z.infer<typeof pricingPlanPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (PricingPlan only). */
export const pricingTablePropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type PricingTableProps = z.infer<typeof pricingTablePropsSchema>;

/**
 * A single animated counter — always a child of StatsCounter. `value` is
 * the target number counted up to; `prefix`/`suffix` are free text around
 * it (e.g. prefix "+", suffix "%" or "clienti"). The count-up animation
 * itself (IntersectionObserver + requestAnimationFrame, respecting
 * `prefers-reduced-motion`) lives entirely in apps/public-site's
 * StatsCounter.astro — same "editor canvas shows a static preview, the
 * public site owns the real interactivity" split as Countdown.
 */
export const statPropsSchema = z.object({
  value: z.number(),
  prefix: z.string(),
  suffix: z.string(),
  label: z.string(),
});
export type StatProps = z.infer<typeof statPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Stat only). */
export const statsCounterPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type StatsCounterProps = z.infer<typeof statsCounterPropsSchema>;

/**
 * A single timeline step — always a child of Timeline. `label` is a short
 * marker (e.g. "Fase 1", "Gennaio 2026"), kept separate from `title`, the
 * same "eyebrow + heading" split PromoBar/Banner already use for their own
 * text hierarchy.
 */
export const timelineStepPropsSchema = z.object({
  label: z.string(),
  title: z.string(),
  description: z.string(),
});
export type TimelineStepProps = z.infer<typeof timelineStepPropsSchema>;

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (TimelineStep only). */
export const timelinePropsSchema = z.strictObject({});
export type TimelineProps = z.infer<typeof timelinePropsSchema>;

/**
 * Standalone newsletter signup — deliberately decoupled from the Form
 * builder (docs/adr/0015): a single email field, its own render/submit
 * path (NewsletterSignup.astro + /api/newsletter/subscribe), no
 * `formId`/fields of its own and no FormSubmission row saved — the
 * subscribe call to NewsletterPort *is* the entire effect, there's no
 * separate "form data" to keep a historical record of. Same
 * honeypot+Turnstile anti-spam treatment as Form (it's the same kind of
 * unauthenticated public write endpoint).
 */
export const newsletterSignupPropsSchema = z.object({
  title: z.string(),
  buttonLabel: z.string(),
});
export type NewsletterSignupProps = z.infer<typeof newsletterSignupPropsSchema>;

/**
 * The worked example for `@kometio/block-sdk`'s `defineBlock()` (see
 * libs/block-sdk/README.md) — a real, first-party block like any other
 * above, not a special case. Its schema lives here for the same reason
 * every other block's does: `BlockRenderer.astro` needs the same schema
 * `defineBlock()` already validated `defaultProps` against, to validate
 * `block.props` again at render time.
 */
export const calloutPropsSchema = z.object({
  message: z.string(),
  tone: z.enum(['info', 'warning', 'success']),
});
export type CalloutProps = z.infer<typeof calloutPropsSchema>;
