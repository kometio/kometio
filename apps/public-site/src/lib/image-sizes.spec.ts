import { describe, expect, it } from 'vitest';
import {
  FULL_WIDTH_SIZES,
  fixedHeightSizes,
  fixedSizes,
  responsiveWidths,
} from './image-sizes';

describe('responsiveWidths', () => {
  it('offers the breakpoints below the original, and the original itself', () => {
    expect(responsiveWidths(1000)).toEqual([320, 480, 640, 960, 1000]);
  });

  /*
   * A variant wider than the original is the same pixels, heavier — the
   * one thing a srcset must never offer.
   */
  it('never offers a width above the original', () => {
    expect(responsiveWidths(400)).toEqual([320, 400]);
    expect(Math.max(...responsiveWidths(4000))).toBe(4000);
  });

  it('offers only the original when it is smaller than every breakpoint', () => {
    expect(responsiveWidths(200)).toEqual([200]);
  });
});

describe('sizes', () => {
  it('a fixed-size image is its size in CSS pixels', () => {
    expect(fixedSizes(40)).toBe('40px');
  });

  it('a logo at a fixed height is as wide as its proportions make it', () => {
    expect(fixedHeightSizes(40, { width: 300, height: 100 })).toBe('120px');
  });

  it('falls back to the full width when the proportions are unknown', () => {
    expect(fixedHeightSizes(40, { width: null, height: null })).toBe(
      FULL_WIDTH_SIZES,
    );
  });
});
