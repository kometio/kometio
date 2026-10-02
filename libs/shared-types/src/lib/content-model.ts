import { z } from 'zod';
import {
  blockVariantNameSchema,
  responsiveBlockStyleSchema,
  type ResponsiveBlockStyle,
} from './site-theme-tokens';

/**
 * The generic format of a content block (the Puck editor's output, phase
 * 2). Each concrete block type (Hero, Text, ...) will define its own schema
 * for `props` — this stays the shared structural shape until then.
 *
 * `children` is our own nesting scheme, independent of Puck's native format
 * (root/content/zones) — see docs/adr/0007. The mapping layer in editor-app
 * converts Puck's drop zones to and from `children`, so we stay able to
 * support "container" blocks without coupling the domain and the DB to a
 * third-party library's internal format.
 *
 * `id` is deliberately optional here, in a transitional window: the one-off
 * backfill (see @kometio/shared-types' backfill-block-ids.ts) assigns a
 * stable id to every existing block before any new editor requires one. It
 * becomes mandatory only in the deploy *after* the backfill — never before,
 * or a save from the still-live Puck editor (which does not write ids)
 * would fail validation halfway through the rollout.
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

export const textPropsSchema = z.object({
  body: z.string(),
});
export type TextProps = z.infer<typeof textPropsSchema>;

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

/**
 * i18n a livello di campo (see the plan) — `pageGroupId` is locale-
 * independent by construction (a group, not one specific translation), on
 * purpose: `locale`/`slug` used to be denormalized here at PICK time, which
 * meant a link picked while editing one language pointed at THAT
 * language's path even when the containing block is shared across every
 * locale of the group (`page` isn't a `translatable` field — real bug,
 * found live: an IT reader could get an EN link). `locale`/`slug` are now
 * `.optional()` — present ONLY on a RESOLVED reference (added by
 * `resolvePageReferences` in page-reference.ts, at publish/preview render
 * time, for the locale actually being rendered), absent on the raw STORED
 * value the editor picker writes. `title` stays denormalized purely for
 * the editor canvas/picker label (same reasoning as PickedForm's
 * `formName`), never used for rendering either way.
 */
export const pickedPageSchema = z.object({
  pageGroupId: z.string(),
  title: z.string(),
  locale: z.string().optional(),
  slug: z.string().optional(),
  /**
   * Filled in at render alongside `locale`/`slug`, never stored by the
   * picker: the page's ancestors in the locale being rendered, root
   * first. Without it a link to a nested page renders as `/it/first-run`
   * — the bare slug — which stopped resolving when slugs became scoped to
   * their siblings (ADR-0029).
   */
  ancestorSlugs: z.array(z.string()).optional(),
});
export type PickedPage = z.infer<typeof pickedPageSchema>;

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

/**
 * The picked media's `url` is denormalized into the block props (not just
 * `mediaId`) so rendering — both the editor canvas and apps/public-site —
 * never needs a live call back to the media API to resolve an id to a URL.
 * `mediaId` is kept alongside it so the editor's media picker can still
 * highlight "this is the currently selected image" reliably, by id rather
 * than by string-matching a URL. `width`/`height` follow the same
 * reasoning (denormalized at pick-time, not re-resolved at render time) —
 * already measured by sharp at upload (see media.width/height,
 * local-disk-media-storage.adapter.ts/s3-media-storage.adapter.ts),
 * nullable only because media picked before this field existed has none.
 * Public-site's image-bearing blocks render them as real `width`/`height`
 * attributes to prevent layout shift (CLS) — omitted, not defaulted, when
 * absent, since a guessed value would be actively wrong. `.nullish()`, not
 * just `.nullable()`: every page saved before this field existed has
 * Image/Gallery/etc. blocks whose `media` object is missing the key
 * entirely, not holding `null` — a plain `.nullable()` would reject that
 * already-saved content outright the first time it's parsed.
 */
export const pickedMediaSchema = z.object({
  mediaId: z.string(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  /**
   * What a download link says about the file — its name, type and size —
   * captured when it is picked. Absent on every media picked before
   * `FileDownload` existed, and on images, which never show them.
   */
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  /**
   * The file's own alternative text, as the library held it when the file
   * was picked — denormalized like `url` and `width`, so an image with no
   * `alt` of its own can still say something. Empty when the file had none,
   * absent on every file picked before the library could hold one.
   */
  alt: z.string().optional(),
});
export type PickedMedia = z.infer<typeof pickedMediaSchema>;

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

/**
 * `formName` is denormalized purely as the editor canvas label (docs/adr/0015)
 * — unlike `PickedMedia.url`, it is never used for rendering on the public
 * site, which live-fetches the form's current name/fields by `formId` on
 * every render instead of trusting this snapshot.
 */
export const pickedFormSchema = z.object({
  formId: z.string(),
  formName: z.string(),
});
export type PickedForm = z.infer<typeof pickedFormSchema>;

export const formBlockPropsSchema = z.object({
  form: pickedFormSchema.nullable(),
});
export type FormBlockProps = z.infer<typeof formBlockPropsSchema>;

/**
 * Shared by every site-chrome block that can be scoped to a breakpoint
 * (Nav, HamburgerMenu, NavLink, LanguageSwitcher) — apps/public-site maps
 * this to the `kometio-visibility-desktop-only`/`kometio-visibility-mobile-only`
 * utility classes (src/styles/visibility.css); `'always'` applies neither.
 * A bare enum, not a wrapper object with its own fixed default, because
 * the sensible default differs per block — each block's own schema below
 * picks its own `.default(...)`.
 */
export const visibilitySchema = z.enum([
  'always',
  'desktop-only',
  'mobile-only',
]);
export type Visibility = z.infer<typeof visibilitySchema>;

/**
 * Nav's only prop today is `visibility` (docs/adr/0018 follow-up,
 * 2026-08-19): defaults to `'always'` because that was its behavior
 * before this field existed (a horizontal row that just wraps on narrow
 * screens) — existing content keeps rendering identically. Its content
 * lives entirely in `Block.children` via a Puck slot field.
 *
 * There is no Header/Footer block anymore (docs/adr/0018 follow-up,
 * 2026-08-19): a site_layout_section's `content` for kind='header'/'footer'
 * IS directly the list of Nav/Text/Image blocks that belongs inside the
 * <header>/<footer> tag — apps/public-site (PR3) supplies that tag itself
 * around the rendered list, it is never a Block. This also means it's
 * structurally impossible to drop a "footer" into the header editor (or
 * vice versa): there is nothing named that to drop.
 */
export const navPropsSchema = z.object({
  visibility: visibilitySchema.default('always'),
});
export type NavProps = z.infer<typeof navPropsSchema>;

/**
 * Shared by every block that can land inside a Nav's flex row (NavLink,
 * LanguageSwitcher, and now HamburgerMenu): "left" leaves it in normal
 * flow, "right" applies a margin-left:auto push in nav.block.tsx's
 * render — the standard CSS trick for splitting a flex row without a
 * separate alignment control on the Nav container itself. Per-item, not
 * per-container, by explicit user request: the concrete case is "links
 * on the left, language switcher on the right, or vice versa" within the
 * same Nav.
 */
export const navItemPositionSchema = z.object({
  position: z.enum(['left', 'right']).default('left'),
});
export type NavItemPosition = z.infer<typeof navItemPositionSchema>;

/**
 * A distinct block from Nav, not a responsive behavior bolted onto it
 * (explicit user request, 2026-08-19): Nav is the desktop link row;
 * HamburgerMenu is a separately placed block with its own icon and its
 * own NavLink/LanguageSwitcher children, so an editor can give mobile
 * visitors different content than desktop (e.g. a "call us" link that
 * isn't in the desktop Nav at all) — not just a collapsed copy of the
 * same links. Renders as a toggle that reveals a dropdown panel directly
 * under itself (apps/public-site's HamburgerMenu.astro). Carries both
 * `navItemPositionSchema` (it can now be placed *inside* Nav's own row,
 * left or right of the links — nav.block.tsx's slot allows it) and its
 * own `visibility`, defaulting to `'mobile-only'`: that was its hardcoded
 * behavior before this field existed, kept as the default so a
 * HamburgerMenu placed before this change keeps behaving the same way.
 */
export const hamburgerMenuPropsSchema = navItemPositionSchema.extend({
  visibility: visibilitySchema.default('mobile-only'),
});
export type HamburgerMenuProps = z.infer<typeof hamburgerMenuPropsSchema>;

/** No other editor-time config: the real links depend on which page the visitor is looking at (site.enabledLocales/translations of THAT page), a runtime fact the editor canvas doesn't have — see LanguageSwitcher.astro. */
export const languageSwitcherPropsSchema = navItemPositionSchema.extend({
  visibility: visibilitySchema.default('always'),
});
export type LanguageSwitcherProps = z.infer<typeof languageSwitcherPropsSchema>;

export const navLinkPropsSchema = navItemPositionSchema.extend({
  label: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
  /** An icon name resolved against the active theme's set (docs/adr/0023) — `null` = no icon. `.default(null)`: NavLinks already saved before this field existed do not have the key. */
  icon: z.string().nullable().default(null),
  visibility: visibilitySchema.default('always'),
});
export type NavLinkProps = z.infer<typeof navLinkPropsSchema>;

/**
 * A dropdown trigger for a one-level submenu (Nav > NavDropdown > NavLink)
 * — deliberately not a link itself: combining "click opens the submenu"
 * and "click navigates" on the same element is the classic mega-menu UX
 * conflict, so `label` is just the toggle text, with no linkType/page/url
 * of its own (unlike NavLink). Deliberately capped at one level of
 * nesting (its own slot only allows NavLink, not another NavDropdown) —
 * arbitrarily deep mega menus are hard to use on touch devices, one
 * level covers the common case (e.g. "Prodotti" revealing a handful of
 * category links).
 */
export const navDropdownPropsSchema = navItemPositionSchema.extend({
  label: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type NavDropdownProps = z.infer<typeof navDropdownPropsSchema>;

/**
 * How a collection arranges the items it holds (ADR-0052).
 *
 * The problem it solves is a multiplication. There are ten collection
 * blocks, each with ONE hard-wired arrangement: `Testimonials` is a
 * slider, `Team` is a grid, and wanting the team as a slider meant a new
 * block type. Ten collections times four arrangements is forty nearly
 * identical files, each with its own CSS, RTL handling, accessibility and
 * translations to keep correct.
 *
 * As a value instead, the same combinations cost one engine and three
 * arrangements.
 *
 * `grid`   — every item visible, wrapping onto rows
 * `slider` — one item at a time, scroll-snapped, with prev/next
 * `carousel` — several at a time, scrolling sideways
 *
 * A PROP and not a field of the block, unlike `variant` (ADR-0048) and
 * `align` (ADR-0049). The rule those two follow is "can a theme change
 * the set of legal values?" — a theme may add or drop a variant, so
 * content pointing at one cannot live in props. These three are core's
 * own, implemented in core CSS, and a theme cannot remove one; there is
 * no dangling value to protect against. Being a prop also means the
 * editor re-renders the block on change, which is exactly what switching
 * arrangement needs, with no new plumbing at all.
 */
export const collectionDisplaySchema = z.enum(['grid', 'slider', 'carousel']);
export type CollectionDisplay = z.infer<typeof collectionDisplaySchema>;

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

/** A hosted audio file — a podcast episode, a recorded message, a track. */
export const audioPropsSchema = z.object({
  media: pickedMediaSchema.nullable(),
  title: z.string().default(''),
  loop: z.boolean().default(false),
});
export type AudioProps = z.infer<typeof audioPropsSchema>;

export const dividerPropsSchema = z.strictObject({});
export type DividerProps = z.infer<typeof dividerPropsSchema>;

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

/**
 * A row of social links (ADR-0053) — a collection, so it arranges itself
 * like every other one (ADR-0052) and each link is edited as its own
 * block rather than through a bespoke list widget.
 */
export const socialLinksPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
});
export type SocialLinksProps = z.infer<typeof socialLinksPropsSchema>;

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

export const carouselPropsSchema = z.object({
  display: collectionDisplaySchema.default('carousel'),
});
export type CarouselProps = z.infer<typeof carouselPropsSchema>;

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

export const quotePropsSchema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string(),
});
export type QuoteProps = z.infer<typeof quotePropsSchema>;

/**
 * `rating` is a plain 1-5 number, not a wrapper object — the Puck `number`
 * field enforces the range in the editor UI (min/max/step in
 * rating.block.tsx), so the schema only needs to describe the shape.
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
 * NavLink's `url`: Puck has no native date-picker field, so this is a
 * plain text field in the editor and the public-site countdown
 * (Countdown.astro) parses it with `new Date(...)` at render time.
 */
export const countdownPropsSchema = z.object({
  targetDate: z.string(),
  label: z.string(),
});
export type CountdownProps = z.infer<typeof countdownPropsSchema>;

/**
 * `html` is sanitized before it ever reaches the DOM — confirmed with the
 * user (2026-08-19), overriding the initial "site owner writes it, skip
 * sanitization" assumption. apps/public-site's EmbedHtml.astro runs it
 * through sanitize-html with a permissive policy (script/iframe kept,
 * since that's the whole point of a free-embed block — YouTube/Calendly/
 * chat widgets are all script- or iframe-based — but any `on*` inline
 * event-handler attribute is stripped). The Puck editor canvas
 * (embed-html.block.tsx) never executes this HTML at all, even
 * sanitized — it only shows the raw code as escaped preview text.
 */
export const embedHtmlPropsSchema = z.object({
  html: z.string(),
});
export type EmbedHtmlProps = z.infer<typeof embedHtmlPropsSchema>;

export const codePropsSchema = z.object({
  code: z.string(),
  language: z.string(),
});
export type CodeProps = z.infer<typeof codePropsSchema>;

/**
 * `rows` is a plain matrix, first row always treated as the header
 * (`<thead>`) by both renders (table.block.tsx and Table.astro) — no
 * separate `headers` field or `hasHeader` toggle, keeping the shape as
 * simple as the hand-built "aggiungi riga/colonna" editor
 * (table-data-field.tsx) that produces it. Not required to stay
 * rectangular by the schema itself — a ragged matrix just renders a
 * ragged table (fewer `<td>`s on a short row), it can't crash the render,
 * so there is nothing to validate for at this boundary.
 */
export const tablePropsSchema = z.object({
  rows: z.array(z.array(z.string())),
});
export type TableProps = z.infer<typeof tablePropsSchema>;
/**
 * "Back to top" — no props beyond `visibility`. Its scroll-threshold
 * show/hide and smooth-scroll-to-top behavior live entirely in
 * apps/public-site's BackToTop.astro `<script>`, the same way
 * HamburgerMenu's open/close toggle has no prop of its own either — this
 * is display/interaction logic, not editor-configurable content.
 */
export const backToTopPropsSchema = z.object({
  visibility: visibilitySchema.default('always'),
});
export type BackToTopProps = z.infer<typeof backToTopPropsSchema>;

/**
 * Floating "chat on WhatsApp" button. `phoneNumber`/`message` build the
 * wa.me deep link directly in apps/public-site's WhatsAppButton.astro
 * (`https://wa.me/<phoneNumber>?text=<encodeURIComponent(message)>`) — no
 * format validation on `phoneNumber` here, same trade-off as NavLink's
 * `url`: the editor is trusted to enter it correctly.
 */
export const whatsAppButtonPropsSchema = z.object({
  phoneNumber: z.string(),
  message: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type WhatsAppButtonProps = z.infer<typeof whatsAppButtonPropsSchema>;

/**
 * "Home > ancestor > ... > current page" trail. No `content` prop: the
 * actual chain comes from the published page's own `ancestors` (page
 * hierarchy, parentId) at render time, not from anything stored on the
 * block — same "editor canvas can't show real data" trade-off as
 * LanguageSwitcher. `homeLabel` is the only editor-configurable piece
 * (the link target itself is always the locale root, computed from
 * `locale` at render time, not stored here).
 */
export const breadcrumbPropsSchema = z.object({
  homeLabel: z.string().default('Home'),
  visibility: visibilitySchema.default('always'),
});
export type BreadcrumbProps = z.infer<typeof breadcrumbPropsSchema>;

/**
 * Dismissible announcement bar. Reuses NavLink's `linkType`/`page`/`url`
 * shape for its optional link, but not `navItemPositionSchema` — unlike
 * NavLink it never sits inside Nav's flex row, it's a standalone
 * full-width bar, so "left"/"right" has no meaning here. Dismissal is a
 * single fixed localStorage key ('kometio-promo-bar-dismissed',
 * apps/public-site's PromoBar.astro) with no per-message versioning: a
 * site owner who changes `message` after a visitor already dismissed the
 * old one won't have it reappear until that visitor clears localStorage —
 * an accepted limitation, not solved here.
 */
export const promoBarPropsSchema = z.object({
  message: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type PromoBarProps = z.infer<typeof promoBarPropsSchema>;

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
 * A plain `<form method="get">` submitting to `/{locale}/search` (see
 * apps/public-site's search.astro) — no client-side fetch/dropdown, same
 * "prefer native mechanisms" reasoning already applied elsewhere
 * (NavDropdown's `<details>`, PromoBar's honeypot). `placeholder` is the
 * only editor-configurable text; the actual results page is not itself a
 * Block-composed page, it's a dedicated Astro route.
 */
/**
 * One entry a PageGrid draws — resolved server-side, never authored.
 *
 * Same treatment as `PickedPage.locale/slug`: the block stores WHICH
 * pages it wants (a term), and the render pass fills in what they are.
 * A client cannot supply these, which is the point — they are the
 * answer to a query, not content.
 */
export const pageGridItemSchema = z.object({
  pageGroupId: z.string(),
  title: z.string(),
  /** Ready to use as an `href`, ancestors included (ADR-0029). */
  path: z.string(),
  /** When this language went live, ISO — `null` for a page whose publication date predates the column. */
  publishedAt: z.string().nullable(),
  /** The page's meta description, which is the summary its author already writes. A card that invents its own from the body would be a second, quietly different summary. */
  excerpt: z.string(),
  /** The page's OG image — the picture it already shows when shared, which is the same one a card wants. */
  image: z.string().nullable(),
  /**
   * The terms this page carries, as the slugs they answer at in the
   * language being rendered — what a `TermList` filter matches against.
   *
   * Filled only for the dimensions a filter on the same page actually
   * offers: every other term would be a slug nobody can select, paid for
   * on every archive that has no filter at all.
   */
  termSlugs: z.array(z.string()).default([]),
});
export type PageGridItem = z.infer<typeof pageGridItemSchema>;

/**
 * The pages filed under a term (ADR-0064) — the block a term's default
 * layout is built from, and the same block an author can place by hand
 * on any page.
 *
 * `termId` is `null` on a freshly inserted one: the block exists before
 * anybody has said which dimension it lists, and rendering nothing is
 * the honest answer until they do.
 */
export const pageGridPropsSchema = z.object({
  termId: z.string().nullable().default(null),
  /**
   * The articles one person wrote, instead of a term's pages — what an
   * author's page lists. Not a field in the editor: it is set by the
   * layout an author's page is built with, the way `items` is filled.
   */
  authorId: z.string().nullable().default(null),
  /** `cards` is the one that shows the date, the summary and the picture — a list of links has nowhere to put them. */
  layout: z.enum(['list', 'grid', 'cards']).default('list'),
  /**
   * Alphabetical, or newest first.
   *
   * It defaults to `title` because that is what every existing list
   * already does, and a default that silently reorders somebody's
   * published pages is not a default, it is an edit. An archive of news
   * says `newest`.
   */
  order: z.enum(['title', 'newest']).default('title'),
  /** 0 = no limit. A term with two hundred pages is a real thing; a page listing all of them is not. */
  limit: z.number().int().min(0).max(100).default(0),
  /**
   * How many entries a reader sees at once, `0` for all of them on one
   * page.
   *
   * Separate from `limit`, which is a cap on the whole list: an archive
   * of two hundred articles wants every one of them reachable, ten at a
   * time, not the first ten and nothing else. Applied after the cap, so
   * the two compose rather than argue.
   */
  perPage: z.number().int().min(0).max(100).default(0),
  emptyText: z.string().default(''),
  items: z.array(pageGridItemSchema).default([]),
});
export type PageGridProps = z.infer<typeof pageGridPropsSchema>;

/**
 * The line an article carries: when it went out, and who wrote it.
 *
 * Both values are FILLED BY THE RENDER PASS from the page the block sits
 * on, never authored — the same rule `PageGrid.items` follows. A date
 * somebody could type here would be a second, quietly different answer to
 * "when was this published", and the two would disagree the first time a
 * page was republished.
 *
 * The author is the display name of whoever created the page, and only
 * that: an account's email address is not something a page publishes.
 */
export const articleMetaPropsSchema = z.object({
  showDate: z.boolean().default(true),
  showAuthor: z.boolean().default(true),
  /** Filled: ISO, `null` when the page has never been published or predates the column. */
  publishedAt: z.string().nullable().default(null),
  /** Filled: empty when the account has no display name, and then nothing is drawn rather than a blank byline. */
  authorName: z.string().default(''),
  /** Filled: the author's page, `null` when they have none to link to. */
  authorPath: z.string().nullable().default(null),
});
export type ArticleMetaProps = z.infer<typeof articleMetaPropsSchema>;

/**
 * The two neighbours of this article inside its own section, by date.
 *
 * "Previous" is the older one and "next" the newer, which is how a reader
 * moving through an archive expects to travel. A page that is not in a
 * section has no set to be a neighbour in, and the block draws nothing
 * rather than inventing one out of the page tree.
 */
export const articleNavPropsSchema = z.object({
  /** Filled: the older neighbour, `null` at the end of the archive. */
  previous: pageGridItemSchema.nullable().default(null),
  /** Filled: the newer neighbour, `null` on the most recent article. */
  next: pageGridItemSchema.nullable().default(null),
});
export type ArticleNavProps = z.infer<typeof articleNavPropsSchema>;

/**
 * Other pages filed under the same terms as this one.
 *
 * The query, not a list somebody keeps up to date by hand: an author who
 * had to pick related articles would be maintaining a second index of the
 * site, and it would go stale the day after it was written.
 */
export const relatedPagesPropsSchema = z.object({
  /** `list` and `cards` are the two the reader can tell apart; cards are the ones with room for a date and a summary. */
  layout: z.enum(['list', 'cards']).default('cards'),
  limit: z.number().int().min(1).max(12).default(3),
  /** Filled: newest first, this page never among them. */
  items: z.array(pageGridItemSchema).default([]),
});
export type RelatedPagesProps = z.infer<typeof relatedPagesPropsSchema>;

/**
 * One term a `TermList` offers, filled in by the render pass.
 *
 * `slug` and `path` are two different answers because the block asks two
 * different questions: narrowing this page needs the slug that goes in
 * `?term=`, opening the term's own page needs its address.
 */
export const termChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** What `?term=` carries — the term's slug in the language being rendered. */
  slug: z.string(),
  /** The term's own page (ADR-0066), for a list that browses rather than filters. */
  path: z.string(),
});
export type TermChoice = z.infer<typeof termChoiceSchema>;

/**
 * The terms of one dimension, as something a reader can click.
 *
 * Two behaviours, because the same row of chips answers two different
 * needs: `filter` narrows the lists already on this page, keeping the
 * reader where they are, and `browse` sends them to the term's own page.
 * The first is what an archive with a `PageGrid` wants; the second is a
 * category index.
 *
 * `choices` is not a field. Like `PageGrid.items` it is the answer to a
 * query, filled by the render pass for the language being read — a list
 * typed by hand would be a second index of the site's own classification,
 * wrong the first time somebody adds a term.
 */
export const termListPropsSchema = z.object({
  /** Which dimension to offer. `null` on a freshly inserted block: it draws nothing until somebody says. */
  taxonomyId: z.string().nullable().default(null),
  behaviour: z.enum(['filter', 'browse']).default('filter'),
  /** `dropdown` is a real `<form method="get">`, so it narrows the page with JavaScript switched off too. */
  style: z.enum(['chips', 'buttons', 'links', 'dropdown']).default('chips'),
  /** The way back to the unfiltered list. Off for a browse list, where "all" is the page the reader is already on. */
  showAll: z.boolean().default(true),
  choices: z.array(termChoiceSchema).default([]),
});
export type TermListProps = z.infer<typeof termListPropsSchema>;

export const searchBoxPropsSchema = z.object({
  placeholder: z.string().default('Cerca nel sito...'),
  visibility: visibilitySchema.default('always'),
});
export type SearchBoxProps = z.infer<typeof searchBoxPropsSchema>;

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
 * same problem table-data-field.tsx solved for a 2D matrix, since Puck has
 * no native list-of-strings field. Reuses NavLink/Banner's
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
