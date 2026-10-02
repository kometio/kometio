/*
 * How wide an image is drawn, told to the browser so it can pick the
 * smallest variant that is still sharp (the `sizes` half of `srcset`).
 *
 * Named here rather than written out in each block because the same few
 * layouts come back everywhere — an image across the page, one card of a
 * grid, half of a two-column row — and a value that drifts between two
 * blocks that look the same is how one of them ends up downloading three
 * times what it shows.
 */

/** Across the whole width available: the image block, a slider, a before/after. */
export const FULL_WIDTH_SIZES = '100vw';

/** One item of a grid that is one column on a phone, two on a tablet, three from there on — cards, products, events, a gallery. */
export const GRID_ITEM_SIZES =
  '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

/** One side of a two-column row that stacks on a phone. */
export const HALF_WIDTH_SIZES = '(max-width: 768px) 100vw, 50vw';

/** An image drawn at a fixed size in CSS pixels — an avatar, a portrait. */
export function fixedSizes(cssPixels: number): string {
  return `${cssPixels}px`;
}

/**
 * An image drawn at a fixed HEIGHT with its width following its own
 * proportions — a logo in a strip. Unknown proportions fall back to the
 * full width, which is never too small.
 */
export function fixedHeightSizes(
  cssHeight: number,
  media: { width?: number | null; height?: number | null },
): string {
  if (!media.width || !media.height) {
    return FULL_WIDTH_SIZES;
  }
  return `${Math.ceil((cssHeight * media.width) / media.height)}px`;
}

/**
 * The widths offered to the browser: a ladder of common breakpoints below
 * the image's own width, and the image's own width — never above it,
 * because a variant larger than the original is the same pixels, heavier.
 */
const LADDER = [320, 480, 640, 960, 1280, 1600, 1920, 2560];

export function responsiveWidths(intrinsicWidth: number): number[] {
  return [...LADDER.filter((width) => width < intrinsicWidth), intrinsicWidth];
}
