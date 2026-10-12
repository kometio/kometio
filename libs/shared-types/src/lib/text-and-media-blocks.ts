import { z } from 'zod';
import {
  collectionDisplaySchema,
  pickedMediaSchema,
  pickedPageSchema,
} from './block-values';
import { defineBlockContract } from './block-contract';
import { asString, pictureAlts } from './search-prose';

/**
 * Per-block-type prop schemas, one per concrete block (Hero, Text, ...).
 * Kept here rather than in `@kometio/block-registry` so apps/public-site can
 * import them without pulling in React at all (see docs/adr/0007 — "any
 * consumer of page content that isn't the editor... can walk children
 * directly without knowing anything about the editor"). Both
 * `@kometio/block-registry`'s field descriptors and apps/public-site's
 * `BlockRenderer.astro` import these same schemas; this file is the single
 * source of truth for each block's shape either way.
 */
export const heroPropsSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  /**
   * The small line above the title — "New in 2026", "Free trial", the
   * pill every landing page opens with (ADR-0056).
   *
   * Empty by default and not rendered when empty, so every hero that
   * exists is unchanged. `themes/docs-showcase` already hardcoded one of
   * these into its own Hero override, which is the clearest evidence it
   * belongs to the block rather than to a theme.
   */
  eyebrow: z.string().default(''),
});
export type HeroProps = z.infer<typeof heroPropsSchema>;
export const heroBlockContract = defineBlockContract({
  type: 'Hero',
  props: heroPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'var(--foreground)',
    borderRadius: '0',
    boxShadow: 'none',
    backgroundImage: 'none',
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    overlayColor: 'transparent',
    minHeight: 'auto',
    // The values the block already rendered — `sm:py-28`'s 7rem is the
    // wide-screen half of a responsive default, so the resolved default
    // shown in the editor is the base one.
    contentAlign: 'stretch',
    gap: '0',
    paddingX: '0',
    paddingY: '5rem',
    maxWidth: '48rem',
  },
  search: (props) => [asString(props['title']), asString(props['subtitle'])],
});

export const textPropsSchema = z.object({
  body: z.string(),
});
export type TextProps = z.infer<typeof textPropsSchema>;
export const textBlockContract = defineBlockContract({
  type: 'Text',
  props: textPropsSchema,
  style: {
    textColor: 'inherit',
  },
  search: (props) => [asString(props['body'])],
});

// A semantic section heading — no existing block filled this gap (Hero's
// title/subtitle are a different intent, Feature's title is centered
// card copy). Added for the generated legal document pages (docs/adr/0040)
// but generally useful on any page needing a real <h2>/<h3>.
export const headingPropsSchema = z.object({
  text: z.string(),
  level: z.enum(['h1', 'h2', 'h3']),
  /**
   * The `id` this heading answers to, so a table of contents can link to
   * it. Filled by the render pass, and only on a page that has a
   * `TableOfContents`: every other heading keeps rendering exactly as it
   * did, with no id nobody links to.
   */
  anchorId: z.string().optional(),
});
export type HeadingProps = z.infer<typeof headingPropsSchema>;
export const headingBlockContract = defineBlockContract({
  type: 'Heading',
  props: headingPropsSchema,
  style: {
    textColor: 'inherit',
  },
  search: (props) => [asString(props['text'])],
});

/**
 * How a block sits in the width available to it (ADR-0057).
 *
 * Not `contentAlign`, which aligns what is INSIDE a block: this places
 * the block's own box, which for an image narrower than its column is the
 * question people actually ask. `start`/`end` rather than left/right so
 * it reads the same on a right-to-left site.
 */
export const blockAlignmentSchema = z.enum(['start', 'center', 'end']);
export type BlockAlignment = z.infer<typeof blockAlignmentSchema>;

/**
 * A picture's shape, as a closed set (ADR-0057).
 *
 * `original` means "whatever the file is", and is the default because it
 * is what every existing image already does. The other four are the
 * shapes a layout is usually built around; a free `aspect-ratio` string
 * would let a gallery be 3:1000.
 */
export const aspectRatioSchema = z.enum([
  'original',
  'square',
  'landscape',
  'portrait',
  'wide',
]);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

export const imagePropsSchema = z.object({
  media: pickedMediaSchema.nullable(),
  alt: z.string(),
  // WCAG: a purely decorative image should have an empty alt on purpose,
  // not a filler string typed just to satisfy a "required" nudge in the
  // editor (InspectorPanel) — this flag is the deliberate-choice escape
  // hatch, authoritative at render time (Image.astro ignores `alt`
  // entirely when this is true, even if it's non-empty from before).
  isDecorative: z.boolean(),
  caption: z.string(),
  /**
   * Where the picture leads (ADR-0057). `linkType: 'none'` — the default
   * — renders no anchor at all, so an image that links nowhere is exactly
   * the markup it was.
   */
  linkType: z.enum(['none', 'page', 'url']).default('none'),
  page: pickedPageSchema.nullable().default(null),
  url: z.string().default(''),
  /**
   * Click to see it full size. Mutually exclusive with a link in
   * practice — the renderer prefers the link, because a link is a
   * navigation the visitor asked for and a lightbox is a convenience.
   */
  lightbox: z.boolean().default(false),
  alignment: blockAlignmentSchema.default('center'),
  aspectRatio: aspectRatioSchema.default('original'),
});
export type ImageProps = z.infer<typeof imagePropsSchema>;
export const imageBlockContract = defineBlockContract({
  type: 'Image',
  props: imagePropsSchema,
  style: {
    borderRadius: '0',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  search: (props) => [asString(props['alt']), asString(props['caption'])],
});

/**
 * The card's own fields are its media header and nothing else — the rest
 * of a card is blocks (ADR-0058). A heading, a paragraph and a Button are
 * already three blocks that do those three jobs well, and a Card that
 * carried its own copies of them would be a fourth, worse one that could
 * never grow a rating, a price or a badge without another field.
 *
 * The header is a field rather than an Image child for one reason a
 * container cannot express: it is edge to edge. The card's padding holds
 * the words away from the border, and the picture has to escape that
 * padding and be clipped by the card's own corner radius. A child sits
 * inside the padding by definition.
 *
 * `alt`/`isDecorative` are Image's pair, deliberately — the same WCAG
 * choice, made the same way, so that what an author learns on one block
 * holds on the other.
 */
export const cardPropsSchema = z.object({
  media: pickedMediaSchema.nullable(),
  alt: z.string(),
  isDecorative: z.boolean(),
});
export type CardProps = z.infer<typeof cardPropsSchema>;
export const cardBlockContract = defineBlockContract({
  type: 'Card',
  props: cardPropsSchema,
  style: {
    // `--background` and not a `--card` token: this theme vocabulary has
    // no such token, and inventing one here would name a custom property
    // no theme.css defines — the reference would resolve to nothing and
    // the card would come out transparent (ADR-0022 resolves these
    // against the active theme, it does not create them).
    backgroundColor: 'var(--background)',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    paddingX: '1.25rem',
    paddingY: '1.25rem',
    gap: '0.75rem',
    contentAlign: 'stretch',
    maxWidth: 'none',
    minHeight: 'auto',
  },
  // Its children index themselves; the header's alt is the card's own
  // only prose, and it is prose for Image's reason.
  search: (props) => [asString(props['alt'])],
  variants: ['elevated', 'flat', 'horizontal'],
});

export const galleryPropsSchema = z.object({
  images: z.array(
    z.object({
      media: pickedMediaSchema.nullable(),
      alt: z.string(),
      isDecorative: z.boolean(),
      /** Shown under the picture. Optional, and absent on every image saved before ADR-0057. */
      caption: z.string().default(''),
    }),
  ),
  /**
   * `auto` keeps the responsive `auto-fill` grid the block always had —
   * as many 200px columns as fit. A number pins it, which is what a
   * three-up layout that must stay three-up needs.
   */
  columns: z.enum(['auto', '2', '3', '4', '5', '6']).default('auto'),
  aspectRatio: aspectRatioSchema.default('square'),
  lightbox: z.boolean().default(false),
});
export type GalleryProps = z.infer<typeof galleryPropsSchema>;
export const galleryBlockContract = defineBlockContract({
  type: 'Gallery',
  props: galleryPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.5rem',
  },
  search: pictureAlts('images'),
});

/**
 * How many of the twelve tracks a column takes (ADR-0050).
 *
 * Twelve because that is the number Bootstrap, the WordPress block editor
 * and every grid system a designer has met use: 6+6 halves, 4+4+4 thirds,
 * 3+9 a sidebar. What it replaces was three fixed presets — `two-equal`,
 * `two-asymmetric`, `three-equal` — which could express a two-column and a
 * three-column page and nothing else at all. A `Column` had `fields: []`:
 * it was structurally impossible to resize one.
 *
 * Optional, and that is the useful part: a column that says nothing takes
 * an equal share of whatever the explicit ones left over
 * (`resolveColumnSpans`), so adding a column to a row that never asked for
 * particular widths keeps them all equal, with nothing to keep in sync by
 * hand.
 */
/**
 * A container whose whole purpose is the arrangement (ADR-0052).
 *
 * The collections above answer "show MY items as a carousel"; this
 * answers "make these three things — whatever they are — scroll". Both
 * are real and neither covers the other: turning a `Testimonials` into a
 * slider keeps it testimonials, with its type-level styling, its variants
 * and (one day) its WordPress import; putting arbitrary blocks in a
 * slider is something no typed collection can express.
 *
 * `carousel` is the default rather than `slider`: somebody reaching for
 * this has several things to show and wants them side by side, which is
 * also the arrangement that degrades best when there are only two.
 */
/**
 * A horizontal rule between sections (ADR-0053).
 *
 * No props at all, deliberately. Everything a divider can be — thickness,
 * colour, style, how wide it runs, the space around it — is already in
 * the style vocabulary (ADR-0047), and per breakpoint at that. A `style`
 * prop next to a `borderStyle` override would be the two-mechanisms
 * mistake ADR-0050 found in Container, before it was made.
 */
/**
 * A video the site hosts itself (ADR-0054), as opposed to `VideoEmbed`,
 * which points at YouTube or Vimeo.
 *
 * The two are not redundant. An embed costs the site no bandwidth and
 * carries the platform's player, its branding and its cookies — which is
 * why `VideoEmbed` sits behind a consent gate. A self-hosted clip has
 * none of that: no third party, no consent to ask for, nothing to gate.
 * It is the right answer for a short product loop and the wrong one for
 * a forty-minute talk.
 *
 * `poster` is a separate image because a browser shows the first frame
 * otherwise — and the first frame of a video is very often black.
 */
export const videoFilePropsSchema = z.object({
  media: pickedMediaSchema.nullable(),
  poster: pickedMediaSchema.nullable(),
  /**
   * Autoplay implies muted, and the schema does not enforce that pairing
   * because the renderer does: every browser blocks an unmuted autoplay,
   * so a video set to autoplay with sound simply does not start. Silently
   * muting is the behaviour that matches what people expect from the
   * checkbox they ticked.
   */
  autoplay: z.boolean().default(false),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  controls: z.boolean().default(true),
});
export type VideoFileProps = z.infer<typeof videoFilePropsSchema>;
export const videoFileBlockContract = defineBlockContract({
  type: 'VideoFile',
  props: videoFilePropsSchema,
  style: {
    borderRadius: '0',
    boxShadow: 'none',
    maxWidth: '100%',
    backgroundColor: '#000',
  },
  search: {
    none: 'a hosted video has no words of its own: its poster and its file are not prose',
  },
});

/** A hosted audio file — a podcast episode, a recorded message, a track. */
export const audioPropsSchema = z.object({
  media: pickedMediaSchema.nullable(),
  title: z.string().default(''),
  loop: z.boolean().default(false),
});
export type AudioProps = z.infer<typeof audioPropsSchema>;
export const audioBlockContract = defineBlockContract({
  type: 'Audio',
  props: audioPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['title'])],
});

export const dividerPropsSchema = z.strictObject({});
export type DividerProps = z.infer<typeof dividerPropsSchema>;
export const dividerBlockContract = defineBlockContract({
  type: 'Divider',
  props: dividerPropsSchema,
  style: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    maxWidth: 'none',
  },
  search: { none: 'a rule: no words' },
});

/**
 * Deliberate empty space (ADR-0053).
 *
 * Also propless, and for a better reason than Divider's: its height is
 * `minHeight`, an ordinary style property, so it can differ per
 * breakpoint — 4rem of air on a desktop and 1rem on a phone, which is the
 * single most common thing anyone actually wants from a spacer and which
 * a plain `height` prop could not express.
 */
export const spacerPropsSchema = z.strictObject({});
export type SpacerProps = z.infer<typeof spacerPropsSchema>;
export const spacerBlockContract = defineBlockContract({
  type: 'Spacer',
  props: spacerPropsSchema,
  style: {
    minHeight: '2rem',
    backgroundColor: 'transparent',
  },
  search: { none: 'empty space: no words' },
});

/** How large a standalone icon renders. A closed set: a free length would let an icon be pasted in at 3px or 900px, and every value here is a size something is actually designed at. */
export const iconSizeSchema = z.enum(['sm', 'md', 'lg', 'xl']);
export type IconSize = z.infer<typeof iconSizeSchema>;

/**
 * A single icon as a block of its own (ADR-0053).
 *
 * `label` is what decides whether it is decoration or content: empty
 * means the icon is hidden from assistive technology (`aria-hidden`),
 * which is correct for a flourish beside text that already says the same
 * thing, and wrong for an icon that IS the message. The same choice
 * `Image.isDecorative` makes, phrased as the label it needs rather than
 * as a checkbox.
 */
export const iconPropsSchema = z.object({
  icon: z.string().nullable(),
  size: iconSizeSchema.default('md'),
  label: z.string().default(''),
});
export type IconProps = z.infer<typeof iconPropsSchema>;
export const iconBlockContract = defineBlockContract({
  type: 'Icon',
  props: iconPropsSchema,
  style: {
    textColor: 'currentColor',
  },
  // An icon's label is what it means when it is not decoration.
  search: (props) => [asString(props['label'])],
});

/**
 * A row of social links (ADR-0053) — a collection, so it arranges itself
 * like every other one (ADR-0052) and each link is edited as its own
 * block rather than through a bespoke list widget.
 */
export const socialLinksPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
});
export type SocialLinksProps = z.infer<typeof socialLinksPropsSchema>;
export const socialLinksBlockContract = defineBlockContract({
  type: 'SocialLinks',
  props: socialLinksPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.75rem',
  },
  search: { none: "a picked icon's wrapper: its words are its children's" },
});

/**
 * One social link.
 *
 * An icon plus a URL rather than a closed list of platforms: a closed
 * list is a promise to keep up with every network that matters, in a
 * release cycle, forever — and it is wrong the day someone wants Mastodon
 * or a Discord invite. `label` is required because an icon-only link with
 * no accessible name is unusable with a screen reader, and it is what a
 * social row is made of.
 */
export const socialLinkPropsSchema = z.object({
  icon: z.string().nullable(),
  label: z.string(),
  url: z.string(),
});
export type SocialLinkProps = z.infer<typeof socialLinkPropsSchema>;
export const socialLinkBlockContract = defineBlockContract({
  type: 'SocialLink',
  props: socialLinkPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '50%',
    paddingX: '0',
    paddingY: '0',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  // The accessible name of an icon-only link is real prose and the only
  // words the block has — someone searching for "Instagram" should find
  // the page whose footer links to it.
  search: (props) => [asString(props['label'])],
});

export const carouselPropsSchema = z.object({
  display: collectionDisplaySchema.default('carousel'),
});
export type CarouselProps = z.infer<typeof carouselPropsSchema>;
export const carouselBlockContract = defineBlockContract({
  type: 'Carousel',
  props: carouselPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: { none: "an arrangement wrapper: its words are its children's" },
});

/**
 * "Solo embed (link YouTube/Vimeo), niente encoding/hosting video lato
 * nostro" (piano progetto, Blocchi editor MVP). `url` is parsed by
 * apps/public-site (parseVideoEmbedUrl) into a privacy-enhanced iframe src
 * — YouTube via youtube-nocookie.com; no such domain exists for Vimeo — and
 * gated behind a click on the public site (no third-party request/cookie
 * until the visitor explicitly asks for the video), same GDPR-conscious
 * pattern as `mapEmbedPropsSchema` below.
 */
export const videoEmbedPropsSchema = z.object({
  url: z.string(),
  /**
   * The image shown before the visitor asks for the video (ADR-0057).
   *
   * It has a second job here that `VideoFile.poster` does not: this block
   * is consent-gated, so until someone clicks, nothing has been requested
   * from YouTube — and the poster is what makes that gate look like a
   * video rather than a grey box.
   */
  poster: pickedMediaSchema.nullable().default(null),
  aspectRatio: aspectRatioSchema.default('wide'),
  caption: z.string().default(''),
});
export type VideoEmbedProps = z.infer<typeof videoEmbedPropsSchema>;
export const videoEmbedBlockContract = defineBlockContract({
  type: 'VideoEmbed',
  props: videoEmbedPropsSchema,
  style: {
    // ConsentGatedEmbed's own fallback: this said 0 while every embed drew 8px.
    borderRadius: '8px',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  search: (props) => [asString(props['caption'])],
});

/**
 * Google Maps by address, using the no-API-key `output=embed` query form
 * (not the paid Maps Embed API) — zero setup for a non-technical site
 * owner. Gated behind a click on the public site (no request to Google, no
 * cookie, until the visitor explicitly asks to see the map): Kometio has no
 * cookie-consent banner yet (batch H, not built), and click-to-load is a
 * complete, self-contained GDPR mitigation on its own, not a stopgap
 * waiting for that banner.
 */
export const mapEmbedPropsSchema = z.object({
  address: z.string(),
});
export type MapEmbedProps = z.infer<typeof mapEmbedPropsSchema>;
export const mapEmbedBlockContract = defineBlockContract({
  type: 'MapEmbed',
  props: mapEmbedPropsSchema,
  style: {
    // ConsentGatedEmbed's own fallback: this said 0 while every embed drew 8px.
    borderRadius: '8px',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  // The address as written on the page — the street someone searches for.
  search: (props) => [asString(props['address'])],
});

/**
 * Same `{ media, alt }[]` shape as `galleryPropsSchema`, on its own named
 * schema rather than reusing that const — same reasoning as
 * `columnPropsSchema`/`accordionPropsSchema`/`tabsPropsSchema` each having
 * their own name despite an identical `z.strictObject({})` shape. Rendered
 * as a swipeable/scroll-snap carousel (ImageSlider.astro) instead of a grid.
 */
export const imageSliderPropsSchema = z.object({
  images: z.array(
    z.object({
      media: pickedMediaSchema.nullable(),
      alt: z.string(),
      isDecorative: z.boolean(),
    }),
  ),
});
export type ImageSliderProps = z.infer<typeof imageSliderPropsSchema>;
export const imageSliderBlockContract = defineBlockContract({
  type: 'ImageSlider',
  props: imageSliderPropsSchema,
  style: {
    borderRadius: '0',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  search: pictureAlts('images'),
});

/**
 * A reveal slider between two images of the same subject. `beforeLabel`/
 * `afterLabel` default to "Prima"/"Dopo" but stay editable — a renovation
 * before/after reads differently than e.g. a progress-photo before/after.
 */
export const beforeAfterPropsSchema = z.object({
  beforeImage: pickedMediaSchema.nullable(),
  afterImage: pickedMediaSchema.nullable(),
  beforeLabel: z.string().default('Prima'),
  afterLabel: z.string().default('Dopo'),
});
export type BeforeAfterProps = z.infer<typeof beforeAfterPropsSchema>;
export const beforeAfterBlockContract = defineBlockContract({
  type: 'BeforeAfter',
  props: beforeAfterPropsSchema,
  style: {
    borderRadius: '8px',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  /*
   * The blocks whose prose search used to miss entirely — each one a
   * decision about which of its fields a visitor is actually looking for,
   * which is why they were left out of the 2026-09-02 batch rather than
   * wired up in bulk.
   *
   * What stays out, and why: an address's URL, a video's URL, a plan's
   * price and period, a statistic's prefix and suffix. A URL is not prose,
   * and a number with its unit ("29", "€", "al mese") matches across pages
   * that have nothing to do with each other — the plan's NAME is what
   * someone types.
   */
  search: (props) => [
    asString(props['beforeLabel']),
    asString(props['afterLabel']),
  ],
});

/**
 * Same `{ media, alt }[]` shape as `galleryPropsSchema`/
 * `imageSliderPropsSchema` — rendered as a wrapping row, grayscale by
 * default with color-on-hover (LogoStrip.astro), the customary visual
 * treatment for an "as seen with" partner/client strip.
 */
export const logoStripPropsSchema = z.object({
  logos: z.array(
    z.object({
      media: pickedMediaSchema.nullable(),
      alt: z.string(),
      isDecorative: z.boolean(),
    }),
  ),
});
export type LogoStripProps = z.infer<typeof logoStripPropsSchema>;
export const logoStripBlockContract = defineBlockContract({
  type: 'LogoStrip',
  props: logoStripPropsSchema,
  style: {
    backgroundColor: 'transparent',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: pictureAlts('logos'),
});

/** Every block this file declares, in the order the picker draws them. */
export const TEXT_AND_MEDIA_BLOCK_CONTRACTS = [
  heroBlockContract,
  cardBlockContract,
  headingBlockContract,
  textBlockContract,
  imageBlockContract,
  galleryBlockContract,
  dividerBlockContract,
  videoFileBlockContract,
  audioBlockContract,
  spacerBlockContract,
  iconBlockContract,
  socialLinksBlockContract,
  socialLinkBlockContract,
  carouselBlockContract,
  videoEmbedBlockContract,
  mapEmbedBlockContract,
  imageSliderBlockContract,
  beforeAfterBlockContract,
  logoStripBlockContract,
] as const;
