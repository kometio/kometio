// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { markEmptyBlocks } from './preview-bridge-client';

/**
 * Nineteen block types render their root conditionally, and the editor's
 * wrapper is `display: contents` — no box of its own. So a freshly
 * inserted Icon, Video or Social link occupied zero pixels: impossible to
 * select, edit or delete from the canvas, with a row in the Layers panel
 * as the only sign it existed.
 */
/** jsdom reports zero for every box, so a rendered child has to say so itself. */
function withBox(el: HTMLElement, height: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ width: 100, height }) as DOMRect,
    configurable: true,
  });
}

function wrapper(type: string, inner: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-kometio-block-id', `${type}-1`);
  el.setAttribute('data-kometio-block-type', type);
  el.style.display = 'contents';
  el.innerHTML = inner;
  return el;
}

describe('markEmptyBlocks', () => {
  it('gives a block that rendered to nothing a box to be clicked', () => {
    const root = document.createElement('div');
    const empty = wrapper('Icon', '');
    root.append(empty);

    markEmptyBlocks(root);

    // jsdom reports 0 for everything, which is exactly the case under
    // test: what matters is that an empty block stops being
    // `display: contents` and carries the marker the placeholder needs.
    expect(empty.dataset['kometioEmpty']).toBe('');
    expect(empty.style.display).toBe('block');
  });

  it('names the type, so the placeholder can say which block it is', () => {
    const root = document.createElement('div');
    const empty = wrapper('SocialLink', '');
    root.append(empty);

    markEmptyBlocks(root);

    expect(empty.getAttribute('data-kometio-block-type')).toBe('SocialLink');
  });

  it('clears the marker when a block stops being empty', () => {
    const root = document.createElement('div');
    const el = wrapper('Icon', '');
    root.append(el);
    markEmptyBlocks(root);
    expect(el.dataset['kometioEmpty']).toBe('');

    // Filled in — and the answer comes from what is UNDER the block, so
    // a block marked once does not keep measuring as its own placeholder.
    el.innerHTML = '<svg></svg>';
    withBox(el.firstElementChild as HTMLElement, 24);
    markEmptyBlocks(root);

    expect(el.dataset['kometioEmpty']).toBeUndefined();
    expect(el.style.display).toBe('contents');
  });

  it('counts a block with only text as rendered, box or no box', () => {
    const root = document.createElement('div');
    const el = wrapper('Text', 'Ciao');
    root.append(el);

    markEmptyBlocks(root);

    expect(el.dataset['kometioEmpty']).toBeUndefined();
  });

  /*
   * This runs from a ResizeObserver watching these very elements. A write
   * on every pass is a write that schedules the next pass: measured at
   * ~900 attribute changes a second on a seven-block page, which is what
   * a flickering canvas is made of. The second pass must touch nothing.
   */
  it('writes nothing on a second pass, which is what stops the canvas flickering', () => {
    const root = document.createElement('div');
    const empty = wrapper('Icon', '');
    const filled = wrapper('Hero', '<h1>Titolo</h1>');
    withBox(filled.firstElementChild as HTMLElement, 40);
    root.append(empty, filled);
    markEmptyBlocks(root);

    let writes = 0;
    const observer = new MutationObserver((records) => {
      writes += records.length;
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['style', 'data-kometio-empty'],
      subtree: true,
    });
    markEmptyBlocks(root);
    // jsdom delivers mutation records on a microtask.
    return Promise.resolve().then(() => {
      observer.disconnect();
      expect(writes).toBe(0);
    });
  });

  it('leaves a block belonging to a section instance alone', () => {
    // Same rule as everything else on the canvas: those blocks belong to
    // the section, not to this page (docs/adr/0059).
    const root = document.createElement('div');
    const section = document.createElement('div');
    section.setAttribute('data-kometio-section-content', '');
    const inside = wrapper('Icon', '');
    section.append(inside);
    root.append(section);

    markEmptyBlocks(root);

    expect(inside.dataset['kometioEmpty']).toBeUndefined();
  });
});
