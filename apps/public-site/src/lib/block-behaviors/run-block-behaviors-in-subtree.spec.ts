// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBlockBehaviorsInSubtree } from './run-block-behaviors-in-subtree';

describe('runBlockBehaviorsInSubtree', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires up an interactive block when the given root itself is the wrapper', () => {
    document.body.innerHTML = `
      <div data-kometio-block-id="tabs-1" data-kometio-block-type="Tabs">
        <div class="kometio-tabs">
          <div class="kometio-tab-panel" data-tab-label="Uno" hidden></div>
        </div>
      </div>
    `;
    const wrapper = document.querySelector('[data-kometio-block-id="tabs-1"]')!;

    runBlockBehaviorsInSubtree(wrapper);

    expect(document.querySelector('.kometio-tabs__list')).not.toBeNull();
  });

  it('wires up every interactive block nested inside a live-inserted container', () => {
    document.body.innerHTML = `
      <div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">
        <div data-kometio-block-id="tabs-1" data-kometio-block-type="Tabs">
          <div class="kometio-tabs">
            <div class="kometio-tab-panel" data-tab-label="Uno" hidden></div>
          </div>
        </div>
        <div data-kometio-block-id="btt-1" data-kometio-block-type="BackToTop">
          <button class="kometio-back-to-top" type="button"></button>
        </div>
      </div>
    `;
    const root = document.querySelector('[data-kometio-block-id="columns-1"]')!;
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;

    runBlockBehaviorsInSubtree(root);

    expect(document.querySelector('.kometio-tabs__list')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('.kometio-back-to-top')?.click();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('does nothing for a block type with no registered behaviors', () => {
    document.body.innerHTML = `
      <div data-kometio-block-id="hero-1" data-kometio-block-type="Hero"></div>
    `;
    const wrapper = document.querySelector('[data-kometio-block-id="hero-1"]')!;

    expect(() => runBlockBehaviorsInSubtree(wrapper)).not.toThrow();
  });
});
