// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { lightboxBehaviors } from './lightbox';
import { runBlockBehaviors } from './run-block-behaviors';

// `document`, not the block element: `runBlockBehaviors` matches the
// behaviour's selector against the root's DESCENDANTS, and the block
// carrying `data-kometio-lightbox` is not its own descendant.
const wire = () => runBlockBehaviors(document, lightboxBehaviors);

function render(): void {
  document.body.innerHTML = `
    <div data-kometio-lightbox data-kometio-lightbox-close="Close it">
      <button type="button" id="open"
              data-kometio-lightbox-src="/photo.webp"
              data-kometio-lightbox-alt="A cat">open</button>
    </div>`;
  wire();
}

const overlay = () => document.querySelector('.kometio-lightbox');
const open = () => document.querySelector<HTMLElement>('#open');

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('lightbox', () => {
  it('opens the picture the trigger names', () => {
    render();
    open()?.click();

    const image = overlay()?.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/photo.webp');
    // Empty alt: the full-size view repeats a picture the page already
    // described, so the dialog's own name carries the meaning.
    expect(image?.getAttribute('alt')).toBe('');
    expect(overlay()?.getAttribute('aria-label')).toBe('A cat');
    expect(overlay()?.getAttribute('aria-modal')).toBe('true');
  });

  it('stops the page behind it from scrolling, and gives the scroll back', () => {
    render();
    open()?.click();
    expect(document.body.style.overflow).toBe('hidden');

    document.querySelector<HTMLElement>('.kometio-lightbox__close')?.click();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape and returns focus to what opened it', () => {
    render();
    const trigger = open();
    trigger?.focus();
    trigger?.click();
    // Focus moves into the dialog, or a keyboard user is left behind it.
    expect(document.activeElement?.className).toBe('kometio-lightbox__close');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when the backdrop is clicked, but not when the picture is', () => {
    render();
    open()?.click();

    overlay()
      ?.querySelector('img')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay()).not.toBeNull();

    overlay()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay()).toBeNull();
  });

  it('keeps Tab inside the dialog, in both directions', () => {
    render();
    open()?.click();
    const close = document.querySelector<HTMLElement>(
      '.kometio-lightbox__close',
    );

    // One focusable element, so Tab has nowhere to go and must stay
    // rather than escaping to the page behind — which is the whole point
    // of a modal, and the thing hand-rolled lightboxes get wrong.
    const forward = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    document.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('ignores other keys while open', () => {
    render();
    open()?.click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(overlay()).not.toBeNull();
  });

  it('does nothing for a trigger with no source', () => {
    document.body.innerHTML = `
      <div data-kometio-lightbox>
        <button type="button" id="open">open</button>
      </div>`;
    wire();

    open()?.click();

    expect(overlay()).toBeNull();
  });

  it('wires each trigger once, however many times it is run', () => {
    // Re-running after a live canvas patch must not attach a second
    // listener — see run-block-behaviors.ts.
    render();
    wire();
    wire();

    open()?.click();

    expect(document.querySelectorAll('.kometio-lightbox')).toHaveLength(1);
  });
});
