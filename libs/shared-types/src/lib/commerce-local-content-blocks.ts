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

/** A main picture and the thumbnails that change it. */
export const productGalleryPropsSchema = z.object({
  images: galleryPropsSchema.shape.images.default([]),
  aspectRatio: aspectRatioSchema.default('square'),
});
export type ProductGalleryProps = z.infer<typeof productGalleryPropsSchema>;

export const discountPricePropsSchema = z.object({
  price: z.number().min(0).nullable().default(null),
  compareAtPrice: z.number().min(0).nullable().default(null),
  currency: currencySchema.default('EUR'),
  /** "VAT included", "per month". */
  note: z.string().default(''),
});
export type DiscountPriceProps = z.infer<typeof discountPricePropsSchema>;

/** A button to wherever the product is paid for — a Stripe or PayPal payment link. */
export const buyButtonPropsSchema = z.object({
  label: z.string().default(''),
  url: z.string().default(''),
  price: z.number().min(0).nullable().default(null),
  currency: currencySchema.default('EUR'),
});
export type BuyButtonProps = z.infer<typeof buyButtonPropsSchema>;

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

/** A testimonial, about a product — the same fields, drawn by the same component. */
export const productReviewPropsSchema = testimonialPropsSchema;
export type ProductReviewProps = z.infer<typeof productReviewPropsSchema>;

export const comparisonTablePropsSchema = z.object({
  /** The things being compared, one per line: "Base", "Pro", "Business". */
  columns: z.string().default(''),
  /** 1-based; 0 highlights none. */
  highlightColumn: z.number().int().min(0).max(6).default(0),
});
export type ComparisonTableProps = z.infer<typeof comparisonTablePropsSchema>;

export const comparisonRowPropsSchema = z.object({
  feature: z.string().default(''),
  /** One per column, one per line. "yes"/"no" (or "sì") become a tick or a cross. */
  values: z.string().default(''),
});
export type ComparisonRowProps = z.infer<typeof comparisonRowPropsSchema>;

export const promoCodePropsSchema = z.object({
  code: z.string().default(''),
  description: z.string().default(''),
  /** YYYY-MM-DD; empty = no end. After it the code is shown as expired, not hidden. */
  expiresOn: z.string().default(''),
});
export type PromoCodeProps = z.infer<typeof promoCodePropsSchema>;

export const shippingReturnsPropsSchema = z.object({
  shippingTitle: z.string().default(''),
  shippingText: z.string().default(''),
  returnsTitle: z.string().default(''),
  returnsText: z.string().default(''),
  supportTitle: z.string().default(''),
  supportText: z.string().default(''),
});
export type ShippingReturnsProps = z.infer<typeof shippingReturnsPropsSchema>;

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

// --- A local business -------------------------------------------------------

export const restaurantMenuPropsSchema = z.object({
  columns: z.enum(['one', 'two']).default('one'),
});
export type RestaurantMenuProps = z.infer<typeof restaurantMenuPropsSchema>;

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

export const eventListPropsSchema = z.object({
  display: collectionDisplaySchema.default('grid'),
});
export type EventListProps = z.infer<typeof eventListPropsSchema>;

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

/** Call, WhatsApp, directions — fixed to the bottom of a phone's screen, from Business info. */
export const stickyContactBarPropsSchema = z.object({
  showCall: z.boolean().default(true),
  /** International format, digits only is fine: "393331234567". Empty = no WhatsApp button. */
  whatsappNumber: z.string().default(''),
  showDirections: z.boolean().default(true),
  showEmail: z.boolean().default(false),
});
export type StickyContactBarProps = z.infer<typeof stickyContactBarPropsSchema>;

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

/** The link every footer needs under the GDPR: change what you consented to. */
export const cookiePreferencesPropsSchema = z.object({
  label: z.string().default(''),
});
export type CookiePreferencesProps = z.infer<
  typeof cookiePreferencesPropsSchema
>;

// --- Editorial content ------------------------------------------------------

export const stepsPropsSchema = z.object({
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
});
export type StepsProps = z.infer<typeof stepsPropsSchema>;

export const stepPropsSchema = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
});
export type StepProps = z.infer<typeof stepPropsSchema>;

export const specListPropsSchema = z.object({
  columns: z.enum(['one', 'two']).default('one'),
});
export type SpecListProps = z.infer<typeof specListPropsSchema>;

export const specItemPropsSchema = z.object({
  label: z.string().default(''),
  value: z.string().default(''),
});
export type SpecItemProps = z.infer<typeof specItemPropsSchema>;

export const progressBarPropsSchema = z.object({
  label: z.string().default(''),
  value: z.number().min(0).max(100).default(50),
  showValue: z.boolean().default(true),
});
export type ProgressBarProps = z.infer<typeof progressBarPropsSchema>;

/** A team member's card, standing on its own and with a way to reach the person. */
export const profileCardPropsSchema = teamMemberPropsSchema.extend({
  email: z.string().default(''),
  phone: z.string().default(''),
});
export type ProfileCardProps = z.infer<typeof profileCardPropsSchema>;

export const bookingProviderSchema = z.enum(['calendly', 'calcom', 'google']);
export type BookingProvider = z.infer<typeof bookingProviderSchema>;

/** A booking page from Calendly, Cal.com or Google Calendar — behind the same consent gate as a video. */
export const bookingEmbedPropsSchema = z.object({
  provider: bookingProviderSchema.default('calendly'),
  url: z.string().default(''),
  height: z.enum(['short', 'medium', 'tall']).default('medium'),
});
export type BookingEmbedProps = z.infer<typeof bookingEmbedPropsSchema>;

/** Several downloads together — its items are the File download block. */
export const fileListPropsSchema = z.object({
  title: z.string().default(''),
});
export type FileListProps = z.infer<typeof fileListPropsSchema>;

export const glossaryPropsSchema = z.object({
  /** A–Z links over the terms. */
  showIndex: z.boolean().default(true),
});
export type GlossaryProps = z.infer<typeof glossaryPropsSchema>;

export const glossaryTermPropsSchema = z.object({
  term: z.string().default(''),
  definition: z.string().default(''),
});
export type GlossaryTermProps = z.infer<typeof glossaryTermPropsSchema>;

/** A quote made to stand out — the Quote block's fields, drawn large. */
export const pullQuotePropsSchema = quotePropsSchema.extend({
  align: z.enum(['start', 'center']).default('center'),
});
export type PullQuoteProps = z.infer<typeof pullQuotePropsSchema>;

export const imageHotspotsPropsSchema = z.object({
  image: pickedMediaSchema.nullable().default(null),
  alt: z.string().default(''),
});
export type ImageHotspotsProps = z.infer<typeof imageHotspotsPropsSchema>;

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

/** The Gallery block's pictures, laid out in columns of their own heights. */
export const masonryGalleryPropsSchema = z.object({
  images: galleryPropsSchema.shape.images.default([]),
  columns: z.enum(['2', '3', '4']).default('3'),
  lightbox: z.boolean().default(true),
});
export type MasonryGalleryProps = z.infer<typeof masonryGalleryPropsSchema>;

/** Video embeds in a row of titles, one playing at a time — its items are the Video embed block. */
export const videoPlaylistPropsSchema = z.object({});
export type VideoPlaylistProps = z.infer<typeof videoPlaylistPropsSchema>;
