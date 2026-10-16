import { z } from 'zod';
import {
  collectionDisplaySchema,
  pickedMediaSchema,
  pickedPageSchema,
} from './block-values';
import { defineBlockContract } from './block-contract';
import { asString, quoteProse, teamMemberProse } from './search-prose';

export const quotePropsSchema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string(),
});
export type QuoteProps = z.infer<typeof quotePropsSchema>;
export const quoteBlockContract = defineBlockContract({
  type: 'Quote',
  props: quotePropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: quoteProse,
});

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
export const ratingBlockContract = defineBlockContract({
  type: 'Rating',
  props: ratingPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['label'])],
});

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
export const countdownBlockContract = defineBlockContract({
  type: 'Countdown',
  props: countdownPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['label'])],
});

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
export const bannerBlockContract = defineBlockContract({
  type: 'Banner',
  props: bannerPropsSchema,
  // The standard five plus the frame and the spacing the two variants need: a
  // border with no width to set is not a control, and `split` turns the
  // block into a flex row whose gap is worth setting.
  style: {
    backgroundColor: 'var(--secondary)',
    textColor: 'inherit',
    borderRadius: '12px',
    paddingX: '1.5rem',
    paddingY: '2.5rem',
    // What the block's own CSS falls back to: no frame by default, and
    // the gap the `split` variant opens between the words and the button.
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    gap: '1.5rem',
  },
  search: (props) => [
    asString(props['title']),
    asString(props['text']),
    asString(props['buttonLabel']),
  ],
  variants: ['split', 'outline'],
});

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
export const buttonBlockContract = defineBlockContract({
  type: 'Button',
  props: buttonPropsSchema,
  // Color/borders/padding — editable for ALL Buttons on the site (the
  // "Style" button in the toolbar) or only for this instance (popover on
  // the selected block), docs/adr/0022. Replaces the old `colorOverride`.
  style: {
    backgroundColor: 'var(--primary)',
    textColor: 'var(--primary-foreground)',
    borderRadius: 'var(--radius)',
    paddingX: '1.25rem',
    paddingY: '0.5rem',
    // The space between an icon and its label (ADR-0056).
    gap: '0.5em',
  },
  search: (props) => [asString(props['label'])],
  variants: ['secondary', 'outline', 'ghost', 'link'],
});

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
export const linkBlockContract = defineBlockContract({
  type: 'Link',
  props: linkPropsSchema,
  style: {
    backgroundColor: 'transparent',
    // What the block renders: the theme's link colour, which is its primary
    // unless it says otherwise (core's \`--link\` is \`var(--primary)\`).
    textColor: 'var(--link, var(--primary))',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['label'])],
});

/** `icon` resolves against the active theme's icon set (docs/adr/0023), same nullable-name pattern as NavLink's own `icon` — `null` = no icon. */
export const featurePropsSchema = z.object({
  icon: z.string().nullable().default(null),
  title: z.string(),
  text: z.string(),
});
export type FeatureProps = z.infer<typeof featurePropsSchema>;
export const featureBlockContract = defineBlockContract({
  type: 'Feature',
  props: featurePropsSchema,
  // The standard five plus `gap`: the `inline` variant makes this block a flex
  // row, so the distance between the icon and the words is now a real
  // thing to set — offering it before the variant existed would have been
  // a control that did nothing.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    // What `.kometio-feature--inline` falls back to.
    gap: '1rem',
  },
  search: (props) => [asString(props['title']), asString(props['text'])],
  variants: ['inline', 'start'],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Feature only). */
export const featureGridPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type FeatureGridProps = z.infer<typeof featureGridPropsSchema>;
export const featureGridBlockContract = defineBlockContract({
  type: 'FeatureGrid',
  props: featureGridPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

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
export const testimonialBlockContract = defineBlockContract({
  type: 'Testimonial',
  props: testimonialPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'var(--foreground)',
    borderRadius: '12px',
    paddingX: '1.5rem',
    paddingY: '1.5rem',
  },
  search: quoteProse,
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Testimonial only). */
export const testimonialsPropsSchema = z.strictObject({
  /** ADR-0052 — `slider` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('slider'),
});
export type TestimonialsProps = z.infer<typeof testimonialsPropsSchema>;
export const testimonialsBlockContract = defineBlockContract({
  type: 'Testimonials',
  props: testimonialsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

/** A single team member card — always a child of Team. */
export const teamMemberPropsSchema = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  photo: pickedMediaSchema.nullable(),
});
export type TeamMemberProps = z.infer<typeof teamMemberPropsSchema>;
export const teamMemberBlockContract = defineBlockContract({
  type: 'TeamMember',
  props: teamMemberPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: teamMemberProse,
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (TeamMember only). */
export const teamPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type TeamProps = z.infer<typeof teamPropsSchema>;
export const teamBlockContract = defineBlockContract({
  type: 'Team',
  props: teamPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

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
export const pricingPlanBlockContract = defineBlockContract({
  type: 'PricingPlan',
  props: pricingPlanPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '12px',
    paddingX: '1.5rem',
    paddingY: '1.5rem',
  },
  search: (props) => [asString(props['name']), asString(props['buttonLabel'])],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (PricingPlan only). */
export const pricingTablePropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type PricingTableProps = z.infer<typeof pricingTablePropsSchema>;
export const pricingTableBlockContract = defineBlockContract({
  type: 'PricingTable',
  props: pricingTablePropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

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
export const statBlockContract = defineBlockContract({
  type: 'Stat',
  props: statPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['label'])],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (Stat only). */
export const statsCounterPropsSchema = z.strictObject({
  /** ADR-0052 — `grid` is what this block already rendered, so existing pages are unchanged. */
  display: collectionDisplaySchema.default('grid'),
});
export type StatsCounterProps = z.infer<typeof statsCounterPropsSchema>;
export const statsCounterBlockContract = defineBlockContract({
  type: 'StatsCounter',
  props: statsCounterPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

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
export const timelineStepBlockContract = defineBlockContract({
  type: 'TimelineStep',
  props: timelineStepPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '1rem',
    paddingY: '1.5rem',
  },
  search: (props) => [
    asString(props['label']),
    asString(props['title']),
    asString(props['description']),
  ],
});

/** Pure layout wrapper, no props of its own — same reasoning as `columnPropsSchema`. Its content lives entirely in `Block.children` (TimelineStep only). */
export const timelinePropsSchema = z.strictObject({});
export type TimelineProps = z.infer<typeof timelinePropsSchema>;
export const timelineBlockContract = defineBlockContract({
  type: 'Timeline',
  props: timelinePropsSchema,
  // No paddingX/paddingY: padding-left is structural in Timeline.astro.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
  },
  search: {
    none: 'an arrangement whose every word belongs to a child that indexes itself',
  },
});

/**
 * Standalone newsletter signup — deliberately decoupled from the Form
 * builder (docs/adr/0015): a single email field, its own render/submit
 * path (NewsletterSignup.astro + /api/newsletter/subscribe), no
 * `formId`/fields of its own and no FormSubmission row saved — the
 * subscribe call to NewsletterPort *is* the entire effect, there's no
 * separate "form data" to keep a historical record of. Same
 * honeypot+captcha anti-spam treatment as Form (it's the same kind of
 * unauthenticated public write endpoint).
 */
export const newsletterSignupPropsSchema = z.object({
  title: z.string(),
  buttonLabel: z.string(),
});
export type NewsletterSignupProps = z.infer<typeof newsletterSignupPropsSchema>;
export const newsletterSignupBlockContract = defineBlockContract({
  type: 'NewsletterSignup',
  props: newsletterSignupPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    maxWidth: '24rem',
  },
  search: (props) => [asString(props['title']), asString(props['buttonLabel'])],
});

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
export const calloutBlockContract = defineBlockContract({
  type: 'Callout',
  props: calloutPropsSchema,
  style: {
    // The tone's own colours are deliberately literal and stay put (see
    // Callout.astro) — what is stylable here is the box around them.
    borderRadius: 'var(--radius)',
    paddingX: '1.25rem',
    paddingY: '1rem',
  },
  search: (props) => [asString(props['message'])],
});

/** Every block this file declares, in the order the picker draws them. */
export const MARKETING_BLOCK_CONTRACTS = [
  quoteBlockContract,
  calloutBlockContract,
  ratingBlockContract,
  countdownBlockContract,
  bannerBlockContract,
  buttonBlockContract,
  linkBlockContract,
  featureGridBlockContract,
  featureBlockContract,
  testimonialsBlockContract,
  testimonialBlockContract,
  teamBlockContract,
  teamMemberBlockContract,
  pricingTableBlockContract,
  pricingPlanBlockContract,
  statsCounterBlockContract,
  statBlockContract,
  timelineBlockContract,
  timelineStepBlockContract,
  newsletterSignupBlockContract,
] as const;
