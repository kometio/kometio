import { describe, expect, it } from 'vitest';
import { readingProgress } from './reading-progress';

describe('readingProgress', () => {
  it('is 0 at the top and 1 at the bottom', () => {
    expect(readingProgress(0, 3000, 1000)).toBe(0);
    expect(readingProgress(2000, 3000, 1000)).toBe(1);
  });

  it('is half-way at half the scrollable distance, not half the page', () => {
    expect(readingProgress(1000, 3000, 1000)).toBe(0.5);
  });

  it('counts a page that does not scroll as read', () => {
    expect(readingProgress(0, 800, 1000)).toBe(1);
  });

  it('stays inside 0–1 when the browser overscrolls', () => {
    expect(readingProgress(-40, 3000, 1000)).toBe(0);
    expect(readingProgress(2100, 3000, 1000)).toBe(1);
  });
});
