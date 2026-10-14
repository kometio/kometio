import type { BlockDescriptor } from './field-types';
import * as blocks from './blocks';

// The core blocks, by name, as the registry has always exported them: the
// barrel is generated from the files (`pnpm run blocks:barrel`), so a block
// is written down here once — in `pageBlocks` below, which is a decision
// (what the picker offers and in what order) and not something the
// directory can say.
export * from './blocks';

/**
 * The page blocks (docs/adr/0007) — "not registered = not droppable",
 * no deny-list. Data only (fields/defaultProps), no `render`: the real
 * Astro component in apps/public-site is the only renderer, shown live
 * in the canvas inside an iframe (see the visual editor plan). Breadcrumb
 * is here (not among the Header/Footer blocks in layout-config.ts, see
 * the comment there) because it's intrinsically per-page content.
 */
export const pageBlocks: BlockDescriptor[] = [
  blocks.columnsBlock,
  blocks.columnBlock,
  blocks.containerBlock,
  blocks.cardBlock,
  blocks.sectionBlock,
  blocks.carouselBlock,
  blocks.dividerBlock,
  blocks.spacerBlock,
  blocks.anchorBlock,
  blocks.heroBlock,
  blocks.headingBlock,
  blocks.textBlock,
  blocks.linkBlock,
  blocks.imageBlock,
  blocks.galleryBlock,
  blocks.quoteBlock,
  blocks.calloutBlock,
  blocks.tableBlock,
  blocks.embedHtmlBlock,
  blocks.codeBlock,
  blocks.breadcrumbBlock,
  blocks.iconBlock,
  blocks.pageGridBlock,
  blocks.articleMetaBlock,
  blocks.authorBoxBlock,
  blocks.articleNavBlock,
  blocks.relatedPagesBlock,
  blocks.termListBlock,
  blocks.tableOfContentsBlock,
  blocks.subPagesBlock,
  blocks.siblingPagesBlock,
  blocks.siteMapBlock,
  blocks.listBlock,
  blocks.listItemBlock,
  blocks.stepsBlock,
  blocks.stepBlock,
  blocks.specListBlock,
  blocks.specItemBlock,
  blocks.progressBarBlock,
  blocks.profileCardBlock,
  blocks.glossaryBlock,
  blocks.glossaryTermBlock,
  blocks.pullQuoteBlock,
  blocks.comparisonTableBlock,
  blocks.comparisonRowBlock,
  blocks.formBlock,
  blocks.newsletterSignupBlock,
  blocks.buttonBlock,
  blocks.searchBoxBlock,
  blocks.countdownBlock,
  blocks.bannerBlock,
  blocks.socialLinksBlock,
  blocks.socialLinkBlock,
  blocks.shareButtonsBlock,
  blocks.trustBadgesBlock,
  blocks.productGridBlock,
  blocks.productCardBlock,
  blocks.productGalleryBlock,
  blocks.discountPriceBlock,
  blocks.buyButtonBlock,
  blocks.productVariantsBlock,
  blocks.productReviewsBlock,
  blocks.productReviewBlock,
  blocks.promoCodeBlock,
  blocks.shippingReturnsBlock,
  blocks.contactDetailsBlock,
  blocks.openingHoursBlock,
  blocks.restaurantMenuBlock,
  blocks.menuItemBlock,
  blocks.eventListBlock,
  blocks.eventItemBlock,
  blocks.stickyContactBarBlock,
  blocks.videoEmbedBlock,
  blocks.mapEmbedBlock,
  blocks.imageSliderBlock,
  blocks.beforeAfterBlock,
  blocks.logoStripBlock,
  blocks.ratingBlock,
  blocks.videoFileBlock,
  blocks.audioBlock,
  blocks.mediaTextBlock,
  blocks.fileDownloadBlock,
  blocks.fileListBlock,
  blocks.bookingEmbedBlock,
  blocks.imageHotspotsBlock,
  blocks.hotspotBlock,
  blocks.masonryGalleryBlock,
  blocks.videoPlaylistBlock,
  blocks.testimonialsBlock,
  blocks.testimonialBlock,
  blocks.teamBlock,
  blocks.teamMemberBlock,
  blocks.pricingTableBlock,
  blocks.pricingPlanBlock,
  blocks.statsCounterBlock,
  blocks.statBlock,
  blocks.timelineBlock,
  blocks.timelineStepBlock,
  blocks.accordionBlock,
  blocks.accordionItemBlock,
  blocks.tabsBlock,
  blocks.tabBlock,
  blocks.featureGridBlock,
  blocks.featureBlock,
  blocks.readingProgressBlock,
  blocks.faqBlock,
  blocks.marqueeBlock,
  blocks.cookiePreferencesBlock,
];

/**
 * The order the picker's drawers open in. A block says which drawer it is
 * in (`category` on its descriptor) and `pageBlocks` above says where in
 * it, so a block is in exactly one drawer by construction: there is no
 * second list of types to keep in step, and no fallback for a forgotten one.
 */
const PAGE_BLOCK_CATEGORY_ORDER = [
  'layout',
  'content',
  'conversion',
  'shop',
  'localBusiness',
  'media',
  'socialProof',
  'interactive',
] as const;

/** Grouping for the block picker, derived from the blocks themselves. */
export const pageBlockCategories: { title: string; types: string[] }[] =
  PAGE_BLOCK_CATEGORY_ORDER.map((category) => ({
    title: `blocks.categories.${category}`,
    types: pageBlocks
      .filter((block) => block.category === category)
      .map((block) => block.type),
  }));
