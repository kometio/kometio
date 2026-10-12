import { z } from 'zod';
import {
  aspectRatioSchema,
  collectionDisplaySchema,
  galleryPropsSchema,
  pickedMediaSchema,
  pickedPageSchema,
  quotePropsSchema,
  teamMemberPropsSchema,
  testimonialPropsSchema,
} from './content-model';
import { defineBlockContract } from './block-contract';
import {
  asString,
  pictureAlts,
  quoteProse,
  teamMemberProse,
} from './search-prose';

/*
 * The last family of the hundred-blocks plan (decided 2026-09-13): the
 * owner took all three packages offered — a shop window, a local
 * business, editorial content — which closes the plan at 115 block types.
 *
 * Where one of these overlaps a block that already exists (a pull quote
 * and a quote, a profile and a team member, a product review and a
 * testimonial, a masonry gallery and a gallery), it is its own entry in
 * the picker, so it can be found, and it renders through the existing
 * component: the plan's own rule was arrangements over forty near-copies.
 */

/** A price is a number and a currency, and never a string somebody typed with a euro sign in the wrong place. */
export const currencySchema = z.enum(['EUR', 'USD', 'GBP', 'CHF']);
export type Currency = z.infer<typeof currencySchema>;

const optionalLink = {
  linkType: z.enum(['page', 'url']).default('url'),
  page: pickedPageSchema.nullable().default(null),
  url: z.string().default(''),
};

// --- A shop window ----------------------------------------------------------

export const productGridPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
});
export type ProductGridProps = z.infer<typeof productGridPropsSchema>;
export const productGridBlockContract = defineBlockContract({
  type: 'ProductGrid',
  props: productGridPropsSchema,
  // The shop window (the last family of the hundred-blocks plan).
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

/**
 * One product: a picture, a name, a price, where to buy it.
 *
 * There is no cart in Kometio and this does not pretend to be one — the link
 * goes to the product's page or to wherever it is sold.
 */
export const productCardPropsSchema = z.object({
  image: pickedMediaSchema.nullable().default(null),
  alt: z.string().default(''),
  name: z.string().default(''),
  description: z.string().default(''),
  price: z.number().min(0).nullable().default(null),
  /** The price before a discount. Shown struck through, and only when higher than `price`. */
  compareAtPrice: z.number().min(0).nullable().default(null),
  currency: currencySchema.default('EUR'),
  /** "New", "-20%", "Last pieces" — a word on the corner of the card. */
  badge: z.string().default(''),
  ...optionalLink,
  /** schema.org Product, so a search engine can show the price. */
  structuredData: z.boolean().default(true),
});
export type ProductCardProps = z.infer<typeof productCardPropsSchema>;
export const productCardBlockContract = defineBlockContract({
  type: 'ProductCard',
  props: productCardPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '1rem',
    paddingY: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  // The last family of the hundred-blocks plan. Every one of these is
  // words somebody typed on this page — a product's name, a dish, an
  // event, a definition — so it is what a search should find the page by.
  search: (props) => [
    asString(props['name']),
    asString(props['description']),
    asString(props['badge']),
  ],
});

/** A main picture and the thumbnails that change it. */
export const productGalleryPropsSchema = z.object({
  images: galleryPropsSchema.shape.images.default([]),
  aspectRatio: aspectRatioSchema.default('square'),
});
export type ProductGalleryProps = z.infer<typeof productGalleryPropsSchema>;
export const productGalleryBlockContract = defineBlockContract({
  type: 'ProductGallery',
  props: productGalleryPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '0',
    paddingY: '0',
    gap: '0.75rem',
    maxWidth: '40rem',
  },
  // The pictures' alt text, for Gallery's reason.
  search: pictureAlts('images'),
});

export const discountPricePropsSchema = z.object({
  price: z.number().min(0).nullable().default(null),
  compareAtPrice: z.number().min(0).nullable().default(null),
  currency: currencySchema.default('EUR'),
  /** "VAT included", "per month". */
  note: z.string().default(''),
});
export type DiscountPriceProps = z.infer<typeof discountPricePropsSchema>;
export const discountPriceBlockContract = defineBlockContract({
  type: 'DiscountPrice',
  props: discountPricePropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['note'])],
});

/** A button to wherever the product is paid for — a Stripe or PayPal payment link. */
export const buyButtonPropsSchema = z.object({
  label: z.string().default(''),
  url: z.string().default(''),
  price: z.number().min(0).nullable().default(null),
  currency: currencySchema.default('EUR'),
});
export type BuyButtonProps = z.infer<typeof buyButtonPropsSchema>;
export const buyButtonBlockContract = defineBlockContract({
  type: 'BuyButton',
  props: buyButtonPropsSchema,
  // A Button, drawn by Button.astro — the same defaults, or the two would disagree about the same element.
  style: {
    backgroundColor: 'var(--primary)',
    textColor: 'var(--primary-foreground)',
    borderRadius: 'var(--radius)',
    paddingX: '1.25rem',
    paddingY: '0.5rem',
    gap: '0.5em',
  },
  search: (props) => [asString(props['label'])],
});

/**
 * The options a product comes in, as information. Not a selector: with no
 * cart there is nothing a choice here could change, and a control that
 * does nothing when pressed is worse than a list.
 */
export const productVariantsPropsSchema = z.object({
  label: z.string().default(''),
  /** One per line. */
  options: z.string().default(''),
});
export type ProductVariantsProps = z.infer<typeof productVariantsPropsSchema>;
export const productVariantsBlockContract = defineBlockContract({
  type: 'ProductVariants',
  props: productVariantsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.5rem',
  },
  search: (props) => [asString(props['label']), asString(props['options'])],
});

export const productReviewsPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
  /**
   * The product being reviewed, for schema.org. Off by default: a review
   * rich result is a claim a search engine checks, and it should be made on
   * purpose, not because a block was dropped on a page.
   */
  structuredData: z.boolean().default(false),
  productName: z.string().default(''),
});
export type ProductReviewsProps = z.infer<typeof productReviewsPropsSchema>;
export const productReviewsBlockContract = defineBlockContract({
  type: 'ProductReviews',
  props: productReviewsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

/** A testimonial, about a product — the same fields, drawn by the same component. */
export const productReviewPropsSchema = testimonialPropsSchema;
export type ProductReviewProps = z.infer<typeof productReviewPropsSchema>;
export const productReviewBlockContract = defineBlockContract({
  type: 'ProductReview',
  props: productReviewPropsSchema,
  // A Testimonial, drawn by Testimonial.astro.
  style: {
    backgroundColor: 'transparent',
    textColor: 'var(--foreground)',
    borderRadius: '12px',
    paddingX: '1.5rem',
    paddingY: '1.5rem',
  },
  search: quoteProse,
});

export const comparisonTablePropsSchema = z.object({
  /** The things being compared, one per line: "Base", "Pro", "Business". */
  columns: z.string().default(''),
  /** 1-based; 0 highlights none. */
  highlightColumn: z.number().int().min(0).max(6).default(0),
});
export type ComparisonTableProps = z.infer<typeof comparisonTablePropsSchema>;
export const comparisonTableBlockContract = defineBlockContract({
  type: 'ComparisonTable',
  props: comparisonTablePropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '0',
    paddingY: '0',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  search: (props) => [asString(props['columns'])],
});

export const comparisonRowPropsSchema = z.object({
  feature: z.string().default(''),
  /** One per column, one per line. "yes"/"no" (or "sì") become a tick or a cross. */
  values: z.string().default(''),
});
export type ComparisonRowProps = z.infer<typeof comparisonRowPropsSchema>;
export const comparisonRowBlockContract = defineBlockContract({
  type: 'ComparisonRow',
  props: comparisonRowPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    paddingX: '1rem',
    paddingY: '0.75rem',
  },
  search: (props) => [asString(props['feature']), asString(props['values'])],
});

export const promoCodePropsSchema = z.object({
  code: z.string().default(''),
  description: z.string().default(''),
  /** YYYY-MM-DD; empty = no end. After it the code is shown as expired, not hidden. */
  expiresOn: z.string().default(''),
});
export type PromoCodeProps = z.infer<typeof promoCodePropsSchema>;
export const promoCodeBlockContract = defineBlockContract({
  type: 'PromoCode',
  props: promoCodePropsSchema,
  style: {
    backgroundColor: 'var(--muted)',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '1rem',
    paddingY: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--border)',
  },
  search: (props) => [asString(props['code']), asString(props['description'])],
});

export const shippingReturnsPropsSchema = z.object({
  shippingTitle: z.string().default(''),
  shippingText: z.string().default(''),
  returnsTitle: z.string().default(''),
  returnsText: z.string().default(''),
  supportTitle: z.string().default(''),
  supportText: z.string().default(''),
});
export type ShippingReturnsProps = z.infer<typeof shippingReturnsPropsSchema>;
export const shippingReturnsBlockContract = defineBlockContract({
  type: 'ShippingReturns',
  props: shippingReturnsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: (props) => [
    asString(props['shippingTitle']),
    asString(props['shippingText']),
    asString(props['returnsTitle']),
    asString(props['returnsText']),
    asString(props['supportTitle']),
    asString(props['supportText']),
  ],
});

export const PAYMENT_METHODS = [
  'visa',
  'mastercard',
  'americanexpress',
  'paypal',
  'applepay',
  'googlepay',
  'klarna',
  'stripe',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const trustBadgesPropsSchema = z.object({
  visa: z.boolean().default(true),
  mastercard: z.boolean().default(true),
  americanexpress: z.boolean().default(false),
  paypal: z.boolean().default(true),
  applepay: z.boolean().default(false),
  googlepay: z.boolean().default(false),
  klarna: z.boolean().default(false),
  stripe: z.boolean().default(false),
  /** "Secure payments · 30-day returns". */
  text: z.string().default(''),
});
export type TrustBadgesProps = z.infer<typeof trustBadgesPropsSchema>;
export const trustBadgesBlockContract = defineBlockContract({
  type: 'TrustBadges',
  props: trustBadgesPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.75rem',
  },
  search: (props) => [asString(props['text'])],
});

// --- A local business -------------------------------------------------------

export const restaurantMenuPropsSchema = z.object({
  columns: z.enum(['one', 'two']).default('one'),
});
export type RestaurantMenuProps = z.infer<typeof restaurantMenuPropsSchema>;
export const restaurantMenuBlockContract = defineBlockContract({
  type: 'RestaurantMenu',
  props: restaurantMenuPropsSchema,
  // A local business.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.25rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

export const menuItemPropsSchema = z.object({
  name: z.string().default(''),
  description: z.string().default(''),
  /** Free text on purpose: "12", "8 / 12", "a partire da 9 €" are all menus. */
  price: z.string().default(''),
  /** Comma-separated: "vegan, gluten-free". */
  dietary: z.string().default(''),
  allergens: z.string().default(''),
});
export type MenuItemProps = z.infer<typeof menuItemPropsSchema>;
export const menuItemBlockContract = defineBlockContract({
  type: 'MenuItem',
  props: menuItemPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [
    asString(props['name']),
    asString(props['description']),
    asString(props['dietary']),
    asString(props['allergens']),
  ],
});

export const eventListPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
});
export type EventListProps = z.infer<typeof eventListPropsSchema>;
export const eventListBlockContract = defineBlockContract({
  type: 'EventList',
  props: eventListPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

export const eventItemPropsSchema = z.object({
  title: z.string().default(''),
  /** YYYY-MM-DD. */
  startDate: z.string().default(''),
  /** HH:MM; empty = an all-day event. */
  startTime: z.string().default(''),
  endDate: z.string().default(''),
  location: z.string().default(''),
  description: z.string().default(''),
  image: pickedMediaSchema.nullable().default(null),
  ...optionalLink,
  /** An event that is over stops showing, rather than inviting people to it. */
  hideWhenPast: z.boolean().default(true),
  structuredData: z.boolean().default(true),
});
export type EventItemProps = z.infer<typeof eventItemPropsSchema>;
export const eventItemBlockContract = defineBlockContract({
  type: 'EventItem',
  props: eventItemPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '1rem',
    paddingY: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  search: (props) => [
    asString(props['title']),
    asString(props['location']),
    asString(props['description']),
  ],
});

/** Call, WhatsApp, directions — fixed to the bottom of a phone's screen, from Business info. */
export const stickyContactBarPropsSchema = z.object({
  showCall: z.boolean().default(true),
  /** International format, digits only is fine: "393331234567". Empty = no WhatsApp button. */
  whatsappNumber: z.string().default(''),
  showDirections: z.boolean().default(true),
  showEmail: z.boolean().default(false),
});
export type StickyContactBarProps = z.infer<typeof stickyContactBarPropsSchema>;
export const stickyContactBarBlockContract = defineBlockContract({
  type: 'StickyContactBar',
  props: stickyContactBarPropsSchema,
  // No radius: a bar running edge to edge of the screen has no corners
  // to round, and a site-wide one (a theme sets it at :root) rounded them.
  style: {
    backgroundColor: 'var(--background)',
    textColor: 'var(--foreground)',
    paddingX: '0.5rem',
    paddingY: '0.5rem',
  },
  search: {
    none: "business info: the site's own contact details, not this page's words",
  },
});

/** Plain share links — no script from any network runs until somebody presses one. */
export const shareButtonsPropsSchema = z.object({
  label: z.string().default(''),
  whatsapp: z.boolean().default(true),
  facebook: z.boolean().default(true),
  linkedin: z.boolean().default(true),
  x: z.boolean().default(false),
  email: z.boolean().default(true),
  copyLink: z.boolean().default(true),
});
export type ShareButtonsProps = z.infer<typeof shareButtonsPropsSchema>;
export const shareButtonsBlockContract = defineBlockContract({
  type: 'ShareButtons',
  props: shareButtonsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.5rem',
  },
  search: (props) => [asString(props['label'])],
});

/** The link every footer needs under the GDPR: change what you consented to. */
export const cookiePreferencesPropsSchema = z.object({
  label: z.string().default(''),
});
export type CookiePreferencesProps = z.infer<
  typeof cookiePreferencesPropsSchema
>;
export const cookiePreferencesBlockContract = defineBlockContract({
  type: 'CookiePreferences',
  props: cookiePreferencesPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['label'])],
});

// --- Editorial content ------------------------------------------------------

export const stepsPropsSchema = z.object({
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
});
export type StepsProps = z.infer<typeof stepsPropsSchema>;
export const stepsBlockContract = defineBlockContract({
  type: 'Steps',
  props: stepsPropsSchema,
  // Editorial content.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1.5rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

export const stepPropsSchema = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
});
export type StepProps = z.infer<typeof stepPropsSchema>;
export const stepBlockContract = defineBlockContract({
  type: 'Step',
  props: stepPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['title']), asString(props['description'])],
});

export const specListPropsSchema = z.object({
  columns: z.enum(['one', 'two']).default('one'),
});
export type SpecListProps = z.infer<typeof specListPropsSchema>;
export const specListBlockContract = defineBlockContract({
  type: 'SpecList',
  props: specListPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '2rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

export const specItemPropsSchema = z.object({
  label: z.string().default(''),
  value: z.string().default(''),
});
export type SpecItemProps = z.infer<typeof specItemPropsSchema>;
export const specItemBlockContract = defineBlockContract({
  type: 'SpecItem',
  props: specItemPropsSchema,
  // No radius: a row is drawn by one rule under it, and a site-wide
  // radius (a theme sets one at :root) bent that rule's ends.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    paddingX: '0',
    paddingY: '0.5rem',
  },
  search: (props) => [asString(props['label']), asString(props['value'])],
});

export const progressBarPropsSchema = z.object({
  label: z.string().default(''),
  value: z.number().min(0).max(100).default(50),
  showValue: z.boolean().default(true),
});
export type ProgressBarProps = z.infer<typeof progressBarPropsSchema>;
export const progressBarBlockContract = defineBlockContract({
  type: 'ProgressBar',
  props: progressBarPropsSchema,
  // The bar is the block: its colour is the fill, its radius the track's, its min height the thickness.
  // The fill's colour, the track's rounding and the bar's thickness — the
  // three things a bar is made of.
  style: {
    backgroundColor: 'var(--primary)',
    textColor: 'inherit',
    borderRadius: '999px',
    minHeight: '0.5rem',
  },
  search: (props) => [asString(props['label'])],
});

/** A team member's card, standing on its own and with a way to reach the person. */
export const profileCardPropsSchema = teamMemberPropsSchema.extend({
  email: z.string().default(''),
  phone: z.string().default(''),
});
export type ProfileCardProps = z.infer<typeof profileCardPropsSchema>;
export const profileCardBlockContract = defineBlockContract({
  type: 'ProfileCard',
  props: profileCardPropsSchema,
  // A TeamMember, drawn by TeamMember.astro.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: teamMemberProse,
});

export const bookingProviderSchema = z.enum(['calendly', 'calcom', 'google']);
export type BookingProvider = z.infer<typeof bookingProviderSchema>;

/** A booking page from Calendly, Cal.com or Google Calendar — behind the same consent gate as a video. */
export const bookingEmbedPropsSchema = z.object({
  provider: bookingProviderSchema.default('calendly'),
  url: z.string().default(''),
  height: z.enum(['short', 'medium', 'tall']).default('medium'),
});
export type BookingEmbedProps = z.infer<typeof bookingEmbedPropsSchema>;
export const bookingEmbedBlockContract = defineBlockContract({
  type: 'BookingEmbed',
  props: bookingEmbedPropsSchema,
  // The same consent gate as VideoEmbed and MapEmbed, so the same real fallbacks.
  style: {
    borderRadius: '8px',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: 'none',
    maxWidth: 'none',
  },
  search: { none: "a third party's booking page: no words of the page's own" },
});

/** Several downloads together — its items are the File download block. */
export const fileListPropsSchema = z.object({
  title: z.string().default(''),
});
export type FileListProps = z.infer<typeof fileListPropsSchema>;
export const fileListBlockContract = defineBlockContract({
  type: 'FileList',
  props: fileListPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.5rem',
  },
  search: (props) => [asString(props['title'])],
});

export const glossaryPropsSchema = z.object({
  /** A–Z links over the terms. */
  showIndex: z.boolean().default(true),
});
export type GlossaryProps = z.infer<typeof glossaryPropsSchema>;
export const glossaryBlockContract = defineBlockContract({
  type: 'Glossary',
  props: glossaryPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

export const glossaryTermPropsSchema = z.object({
  term: z.string().default(''),
  definition: z.string().default(''),
});
export type GlossaryTermProps = z.infer<typeof glossaryTermPropsSchema>;
export const glossaryTermBlockContract = defineBlockContract({
  type: 'GlossaryTerm',
  props: glossaryTermPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['term']), asString(props['definition'])],
});

/** A quote made to stand out — the Quote block's fields, drawn large. */
export const pullQuotePropsSchema = quotePropsSchema.extend({
  align: z.enum(['start', 'center']).default('center'),
});
export type PullQuoteProps = z.infer<typeof pullQuotePropsSchema>;
export const pullQuoteBlockContract = defineBlockContract({
  type: 'PullQuote',
  props: pullQuotePropsSchema,
  // A Quote, drawn by Quote.astro, with the room a pull quote stands in.
  // No radius: the quote is framed by a rule above and below, and a
  // site-wide radius (a theme sets one at :root) bent their ends.
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    paddingX: '0',
    paddingY: '1.5rem',
  },
  search: quoteProse,
});

export const imageHotspotsPropsSchema = z.object({
  image: pickedMediaSchema.nullable().default(null),
  alt: z.string().default(''),
});
export type ImageHotspotsProps = z.infer<typeof imageHotspotsPropsSchema>;
export const imageHotspotsBlockContract = defineBlockContract({
  type: 'ImageHotspots',
  props: imageHotspotsPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: 'var(--radius)',
    paddingX: '0',
    paddingY: '0',
  },
  search: (props) => [asString(props['alt'])],
});

export const hotspotPropsSchema = z.object({
  /**
   * Percent from the LEFT edge and from the top of the picture — left, not
   * the start edge: a photograph is not mirrored in a right-to-left
   * language, so the point on it has to stay where it is.
   */
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  title: z.string().default(''),
  text: z.string().default(''),
});
export type HotspotProps = z.infer<typeof hotspotPropsSchema>;
export const hotspotBlockContract = defineBlockContract({
  type: 'Hotspot',
  props: hotspotPropsSchema,
  style: {
    backgroundColor: 'var(--primary)',
    textColor: 'var(--primary-foreground)',
  },
  search: (props) => [asString(props['title']), asString(props['text'])],
});

/** The Gallery block's pictures, laid out in columns of their own heights. */
export const masonryGalleryPropsSchema = z.object({
  images: galleryPropsSchema.shape.images.default([]),
  columns: z.enum(['2', '3', '4']).default('3'),
  lightbox: z.boolean().default(true),
});
export type MasonryGalleryProps = z.infer<typeof masonryGalleryPropsSchema>;
export const masonryGalleryBlockContract = defineBlockContract({
  type: 'MasonryGallery',
  props: masonryGalleryPropsSchema,
  // A Gallery, drawn by Gallery.astro.
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

/** Video embeds in a row of titles, one playing at a time — its items are the Video embed block. */
export const videoPlaylistPropsSchema = z.object({});
export type VideoPlaylistProps = z.infer<typeof videoPlaylistPropsSchema>;
export const videoPlaylistBlockContract = defineBlockContract({
  type: 'VideoPlaylist',
  props: videoPlaylistPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '1rem',
  },
  search: {
    none: 'an arrangement whose words all live in its children, which index themselves',
  },
});

/** Every block this file declares, in the order the picker draws them. */
export const COMMERCE_LOCAL_CONTENT_BLOCK_CONTRACTS = [
  productGridBlockContract,
  productCardBlockContract,
  productGalleryBlockContract,
  discountPriceBlockContract,
  buyButtonBlockContract,
  productVariantsBlockContract,
  productReviewsBlockContract,
  productReviewBlockContract,
  comparisonTableBlockContract,
  comparisonRowBlockContract,
  promoCodeBlockContract,
  shippingReturnsBlockContract,
  trustBadgesBlockContract,
  restaurantMenuBlockContract,
  menuItemBlockContract,
  eventListBlockContract,
  eventItemBlockContract,
  stickyContactBarBlockContract,
  shareButtonsBlockContract,
  cookiePreferencesBlockContract,
  stepsBlockContract,
  stepBlockContract,
  specListBlockContract,
  specItemBlockContract,
  progressBarBlockContract,
  profileCardBlockContract,
  bookingEmbedBlockContract,
  fileListBlockContract,
  glossaryBlockContract,
  glossaryTermBlockContract,
  pullQuoteBlockContract,
  imageHotspotsBlockContract,
  hotspotBlockContract,
  masonryGalleryBlockContract,
  videoPlaylistBlockContract,
] as const;
