import { describe, expect, it } from 'vitest';
import {
  bookingEmbedPropsSchema,
  buyButtonPropsSchema,
  comparisonRowPropsSchema,
  comparisonTablePropsSchema,
  cookiePreferencesPropsSchema,
  discountPricePropsSchema,
  eventItemPropsSchema,
  eventListPropsSchema,
  fileListPropsSchema,
  glossaryPropsSchema,
  glossaryTermPropsSchema,
  hotspotPropsSchema,
  imageHotspotsPropsSchema,
  masonryGalleryPropsSchema,
  menuItemPropsSchema,
  productCardPropsSchema,
  productGalleryPropsSchema,
  productGridPropsSchema,
  productReviewPropsSchema,
  productReviewsPropsSchema,
  productVariantsPropsSchema,
  profileCardPropsSchema,
  progressBarPropsSchema,
  promoCodePropsSchema,
  pullQuotePropsSchema,
  restaurantMenuPropsSchema,
  shareButtonsPropsSchema,
  shippingReturnsPropsSchema,
  specItemPropsSchema,
  specListPropsSchema,
  stepPropsSchema,
  stepsPropsSchema,
  stickyContactBarPropsSchema,
  trustBadgesPropsSchema,
  videoPlaylistPropsSchema,
} from './commerce-local-content-blocks';

/*
 * A block's saved props are parsed by BlockRenderer on every render, and a
 * block whose props fail to parse is skipped (block-render-degradation).
 * So what a freshly inserted block saves — its defaults — has to parse,
 * and what the fields forbid has to be refused here too, not only in the
 * editor's inputs.
 */
describe('the last family of block schemas', () => {
  describe('fills a freshly inserted block with its defaults', () => {
    const schemas = {
      productGridPropsSchema,
      productCardPropsSchema,
      productGalleryPropsSchema,
      discountPricePropsSchema,
      buyButtonPropsSchema,
      productVariantsPropsSchema,
      productReviewsPropsSchema,
      comparisonTablePropsSchema,
      comparisonRowPropsSchema,
      promoCodePropsSchema,
      shippingReturnsPropsSchema,
      trustBadgesPropsSchema,
      restaurantMenuPropsSchema,
      menuItemPropsSchema,
      eventListPropsSchema,
      eventItemPropsSchema,
      stickyContactBarPropsSchema,
      shareButtonsPropsSchema,
      cookiePreferencesPropsSchema,
      stepsPropsSchema,
      stepPropsSchema,
      specListPropsSchema,
      specItemPropsSchema,
      progressBarPropsSchema,
      bookingEmbedPropsSchema,
      fileListPropsSchema,
      glossaryPropsSchema,
      glossaryTermPropsSchema,
      imageHotspotsPropsSchema,
      hotspotPropsSchema,
      masonryGalleryPropsSchema,
      videoPlaylistPropsSchema,
    };

    it.each(Object.entries(schemas))(
      '%s parses an empty object',
      (_, schema) => {
        expect(schema.safeParse({}).success).toBe(true);
      },
    );
  });

  it('gives a product card no price and euros until one is set', () => {
    expect(productCardPropsSchema.parse({})).toMatchObject({
      price: null,
      compareAtPrice: null,
      currency: 'EUR',
      structuredData: true,
    });
  });

  it('refuses a negative price and a currency it does not know', () => {
    expect(productCardPropsSchema.safeParse({ price: -1 }).success).toBe(false);
    expect(
      discountPricePropsSchema.safeParse({ compareAtPrice: -5 }).success,
    ).toBe(false);
    expect(buyButtonPropsSchema.safeParse({ currency: 'JPY' }).success).toBe(
      false,
    );
  });

  it('keeps a progress bar and a hotspot inside 0–100', () => {
    expect(progressBarPropsSchema.safeParse({ value: 101 }).success).toBe(
      false,
    );
    expect(hotspotPropsSchema.safeParse({ x: -1 }).success).toBe(false);
    expect(hotspotPropsSchema.safeParse({ y: 100 }).success).toBe(true);
  });

  it('highlights at most one of the six columns a comparison can have', () => {
    expect(
      comparisonTablePropsSchema.safeParse({ highlightColumn: 6 }).success,
    ).toBe(true);
    expect(
      comparisonTablePropsSchema.safeParse({ highlightColumn: 7 }).success,
    ).toBe(false);
    expect(
      comparisonTablePropsSchema.safeParse({ highlightColumn: 1.5 }).success,
    ).toBe(false);
  });

  it('offers only the booking services the page can frame', () => {
    expect(
      bookingEmbedPropsSchema.safeParse({ provider: 'calcom' }).success,
    ).toBe(true);
    expect(
      bookingEmbedPropsSchema.safeParse({ provider: 'acuity' }).success,
    ).toBe(false);
  });

  it('hides a past event and shows its structured data unless told otherwise', () => {
    expect(eventItemPropsSchema.parse({})).toMatchObject({
      hideWhenPast: true,
      structuredData: true,
      startDate: '',
      startTime: '',
    });
  });

  it('keeps product review structured data off by default', () => {
    expect(productReviewsPropsSchema.parse({}).structuredData).toBe(false);
  });

  /*
   * The overlapping blocks are the existing block's fields: a props object
   * valid for one is valid for the other, which is what lets them render
   * through the same component.
   */
  it('takes the fields of the block each overlapping block is drawn by', () => {
    const review = {
      quote: '<p>Great</p>',
      author: 'Anna',
      role: '',
      avatar: null,
      rating: 5,
    };
    expect(productReviewPropsSchema.parse(review)).toEqual(review);

    expect(
      profileCardPropsSchema.parse({
        name: 'Giulia',
        role: 'Founder',
        bio: '',
        photo: null,
      }),
    ).toMatchObject({ email: '', phone: '' });

    expect(
      pullQuotePropsSchema.parse({ quote: 'Q', author: '', role: '' }).align,
    ).toBe('center');

    expect(masonryGalleryPropsSchema.parse({})).toEqual({
      images: [],
      columns: '3',
      lightbox: true,
    });
  });
});
