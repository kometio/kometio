// scrollBy({ left }) moves the viewport physically rightward for a positive
// value and leftward for a negative one, regardless of text direction.
// "Prev"/"next" are logical (reading-order) concepts: under dir="rtl" the
// previous item sits physically to the right, so the physical scroll sign
// must flip relative to what it is under dir="ltr". Shared by
// image-slider.ts and testimonials.ts, the two carousels with this exact
// prev/next-button-driven scrollBy pattern.
export function carouselScrollSign(track: Element, step: 1 | -1): 1 | -1 {
  const isRtl = getComputedStyle(track).direction === 'rtl';
  return isRtl ? (-step as 1 | -1) : step;
}
