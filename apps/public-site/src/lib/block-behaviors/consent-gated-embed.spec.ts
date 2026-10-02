// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { consentGatedEmbedBehaviors } from './consent-gated-embed';
import { runBlockBehaviors } from './run-block-behaviors';

function renderTrigger(src: string, title: string): HTMLElement {
  document.body.innerHTML = `
    <div class="kometio-consent-embed">
      <button
        type="button"
        class="kometio-consent-embed__trigger"
        data-embed-src="${src}"
        data-embed-title="${title}"
      >Load</button>
    </div>
  `;
  return document.querySelector<HTMLElement>('.kometio-consent-embed')!;
}

describe('consentGatedEmbedBehaviors', () => {
  it('replaces the trigger button with a loaded iframe on click', () => {
    const container = renderTrigger('https://example.com/embed', 'A video');
    runBlockBehaviors(document, consentGatedEmbedBehaviors);

    container
      .querySelector<HTMLButtonElement>('.kometio-consent-embed__trigger')
      ?.click();

    expect(container.querySelector('button')).toBeNull();
    const iframe = container.querySelector<HTMLIFrameElement>(
      '.kometio-consent-embed__iframe',
    );
    expect(iframe?.src).toBe('https://example.com/embed');
    expect(iframe?.title).toBe('A video');
  });

  it('is safe to re-run on an already-replaced trigger (live-patch re-init)', () => {
    const container = renderTrigger('https://example.com/embed', 'A video');
    runBlockBehaviors(document, consentGatedEmbedBehaviors);
    container
      .querySelector<HTMLButtonElement>('.kometio-consent-embed__trigger')
      ?.click();

    expect(() =>
      runBlockBehaviors(document, consentGatedEmbedBehaviors),
    ).not.toThrow();
    expect(
      container.querySelector('.kometio-consent-embed__iframe'),
    ).not.toBeNull();
  });

  it('does not attach a second click listener on a re-run before the first click', () => {
    const container = renderTrigger('https://example.com/embed', 'A video');
    runBlockBehaviors(document, consentGatedEmbedBehaviors);
    runBlockBehaviors(document, consentGatedEmbedBehaviors);

    container
      .querySelector<HTMLButtonElement>('.kometio-consent-embed__trigger')
      ?.click();

    // A double-attached listener would try to `replaceWith` a node that's
    // no longer in the tree on its second invocation — asserting exactly
    // one iframe (not throwing, not two) is the real behavior that matters.
    expect(
      container.querySelectorAll('.kometio-consent-embed__iframe'),
    ).toHaveLength(1);
  });
});
