// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nextThumbnailIndex, productGalleryBehaviors } from './product-gallery';
import { runBlockBehaviors } from './run-block-behaviors';

function gallery(count: number): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-kometio-product-gallery', '');
  const stage = Array.from(
    { length: count },
    (_, i) =>
      `<figure class="kometio-product-gallery__slide"${i === 0 ? '' : ' hidden'}></figure>`,
  ).join('');
  const thumbs = Array.from(
    { length: count },
    (_, i) =>
      `<button class="kometio-product-gallery__thumb" aria-pressed="${i === 0}"></button>`,
  ).join('');
  root.innerHTML = `<div>${stage}</div><div>${thumbs}</div>`;
  document.body.append(root);
  return root;
}

const visible = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLElement>('.kometio-product-gallery__slide'),
  )
    .map((slide, i) => (slide.hidden ? null : i))
    .filter((i) => i !== null);

describe('product gallery', () => {
  it('shows the picture whose thumbnail is pressed, and only that one', () => {
    const root = gallery(3);
    runBlockBehaviors(document, productGalleryBehaviors);

    root.querySelectorAll<HTMLButtonElement>('button')[2]?.click();

    expect(visible(root)).toEqual([2]);
    const pressed = Array.from(root.querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-pressed'),
    );
    expect(pressed).toEqual(['false', 'false', 'true']);
    root.remove();
  });

  it('does not wire the same gallery twice when behaviours re-run', () => {
    const root = gallery(2);
    runBlockBehaviors(document, productGalleryBehaviors);
    runBlockBehaviors(document, productGalleryBehaviors);

    root.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
    expect(visible(root)).toEqual([1]);
    root.remove();
  });

  it('moves with the arrow keys the way the row reads', () => {
    expect(nextThumbnailIndex(0, 3, 'ArrowRight', 'ltr')).toBe(1);
    expect(nextThumbnailIndex(0, 3, 'ArrowLeft', 'ltr')).toBe(2);
    expect(nextThumbnailIndex(0, 3, 'ArrowLeft', 'rtl')).toBe(1);
    expect(nextThumbnailIndex(2, 3, 'Home', 'ltr')).toBe(0);
    expect(nextThumbnailIndex(0, 3, 'End', 'ltr')).toBe(2);
    expect(nextThumbnailIndex(0, 3, 'Enter', 'ltr')).toBeNull();
  });
});
