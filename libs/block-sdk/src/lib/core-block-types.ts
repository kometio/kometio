/**
 * Every block type Kometio core ships (docs/adr/0041). A theme's own
 * `.block.ts` must not reuse one of these names — a collision would make
 * the theme's block shadow a core one in the editor's picker, which is an
 * override's job (`blocks/<Name>.astro`), not a new type's.
 *
 * It is a literal list rather than something derived from
 * `@kometio/block-registry`, because a theme is built outside this monorepo
 * with this SDK and without the registry: ADR-0037 fixed the dependency
 * direction so that it can be. Before this constant existed, every theme had to
 * depend on `block-registry` just to run its own collision check, which
 * meant a theme could not be developed outside this monorepo at all.
 *
 * Drift is not left to discipline: `libs/block-registry`'s own
 * `core-block-types.spec.ts` asserts this list matches the registry's
 * actual descriptors exactly, and fails CI naming what to add or remove.
 * That test is the only place allowed to know both.
 */
export const CORE_BLOCK_TYPES: readonly string[] = [
  'Accordion',
  'AccordionItem',
  'Anchor',
  'ArticleMeta',
  'ArticleNav',
  'Audio',
  'AuthorBox',
  'BackToTop',
  'Banner',
  'BeforeAfter',
  'BookingEmbed',
  'Breadcrumb',
  'Button',
  'BuyButton',
  'Callout',
  'Card',
  'Carousel',
  'Code',
  'Column',
  'Columns',
  'ComparisonRow',
  'ComparisonTable',
  'ContactDetails',
  'Container',
  'CookiePreferences',
  'Countdown',
  'DiscountPrice',
  'Divider',
  'EmbedHtml',
  'EventItem',
  'EventList',
  'Faq',
  'Feature',
  'FeatureGrid',
  'FileDownload',
  'FileList',
  'Form',
  'Gallery',
  'Glossary',
  'GlossaryTerm',
  'HamburgerMenu',
  'Heading',
  'Hero',
  'Hotspot',
  'Icon',
  'Image',
  'ImageHotspots',
  'ImageSlider',
  'LanguageSwitcher',
  'Link',
  'List',
  'ListItem',
  'LogoStrip',
  'MapEmbed',
  'Marquee',
  'MasonryGallery',
  'MediaText',
  'MenuItem',
  'Nav',
  'NavDropdown',
  'NavLink',
  'NewsletterSignup',
  'OpeningHours',
  'PageGrid',
  'PricingPlan',
  'PricingTable',
  'ProductCard',
  'ProductGallery',
  'ProductGrid',
  'ProductReview',
  'ProductReviews',
  'ProductVariants',
  'ProfileCard',
  'ProgressBar',
  'PromoBar',
  'PromoCode',
  'PullQuote',
  'Quote',
  'Rating',
  'ReadingProgress',
  'RelatedPages',
  'RestaurantMenu',
  'SearchBox',
  'Section',
  'ShareButtons',
  'ShippingReturns',
  'SiblingPages',
  'SiteMap',
  'SocialLink',
  'SocialLinks',
  'Spacer',
  'SpecItem',
  'SpecList',
  'Stat',
  'StatsCounter',
  'Step',
  'Steps',
  'StickyContactBar',
  'SubPages',
  'Tab',
  'Table',
  'TableOfContents',
  'Tabs',
  'Team',
  'TeamMember',
  'TermList',
  'Testimonial',
  'Testimonials',
  'Text',
  'Timeline',
  'TimelineStep',
  'TrustBadges',
  'VideoEmbed',
  'VideoFile',
  'VideoPlaylist',
  'WhatsAppButton',
];

/**
 * The block types among `candidates` that collide with a core type. Empty
 * means the theme's block set is safe to ship. Kept separate from
 * `validateThemeBlockSet` so a caller can report it distinctly — a
 * collision is a naming mistake, not a malformed descriptor.
 */
export function findCoreBlockTypeCollisions(
  themeBlockTypes: readonly string[],
): string[] {
  const core = new Set(CORE_BLOCK_TYPES);
  return themeBlockTypes.filter((type) => core.has(type));
}

/**
 * The variants each core block type ships, for the same reason and with
 * the same discipline as `CORE_BLOCK_TYPES` above: a theme may ADD looks
 * to a core block (ADR-0047), and it must not redeclare one the block
 * already has — that would put the same entry in the picker twice, one of
 * them unreachable.
 *
 * A literal map rather than something derived, because deriving it means
 * importing `@kometio/block-registry`, which is React and editor UI: the
 * dependency ADR-0037 removed so a theme can be built outside this
 * monorepo at all. `libs/block-registry`'s own `core-block-types.spec.ts`
 * asserts it matches the real descriptors and fails naming what to fix,
 * exactly as it already does for the type list.
 *
 * Only types that actually declare variants appear. Everything else has
 * one look and nothing to collide with.
 */
export const CORE_BLOCK_VARIANTS: Readonly<Record<string, readonly string[]>> =
  {
    Banner: ['split', 'outline'],
    Button: ['secondary', 'outline', 'ghost', 'link'],
    Card: ['elevated', 'flat', 'horizontal'],
    Feature: ['inline', 'start'],
  };
