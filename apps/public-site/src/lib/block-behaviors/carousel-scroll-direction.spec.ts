// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { carouselScrollSign } from './carousel-scroll-direction';

describe('carouselScrollSign', () => {
  it('keeps the sign unchanged under ltr', () => {
    const track = document.createElement('div');
    track.style.direction = 'ltr';
    expect(carouselScrollSign(track, 1)).toBe(1);
    expect(carouselScrollSign(track, -1)).toBe(-1);
  });

  it('flips the sign under rtl', () => {
    const track = document.createElement('div');
    track.style.direction = 'rtl';
    expect(carouselScrollSign(track, 1)).toBe(-1);
    expect(carouselScrollSign(track, -1)).toBe(1);
  });
});
