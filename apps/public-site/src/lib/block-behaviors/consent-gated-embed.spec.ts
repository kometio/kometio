// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { consentGatedEmbedBehaviors } from './consent-gated-embed';
import { runBlockBehaviors } from './run-block-behaviors';
import { instanceOf } from '../../test/dom.test-fixture';

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
  return instanceOf(
    document.querySelector('.kometio-consent-embed'),
    HTMLElement,
    'the embed container',
  );
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

  // Once a visitor has agreed to the category through the banner, asking
  // them again with a button is a second question for an answer already
  // given (docs/adr/0131).
  describe('a visitor who has already agreed to its category', () => {
    afterEach(() => {
      // @ts-expect-error -- test-only cleanup of the consent API.
      delete window.kometioConsent;
    });

    function consentTo(categories: string[]) {
      window.kometioConsent = {
        get: () => null,
        has: (category: string) => categories.includes(category),
        apply: () => undefined,
        openPreferences: () => undefined,
      };
    }

    it('gets the embed without being asked', () => {
      consentTo(['experience']);
      const container = renderTrigger('https://example.com/embed', 'A video');

      runBlockBehaviors(document, consentGatedEmbedBehaviors);

      expect(container.querySelector('button')).toBeNull();
      expect(
        container.querySelector<HTMLIFrameElement>(
          '.kometio-consent-embed__iframe',
        )?.src,
      ).toBe('https://example.com/embed');
    });

    it('is still asked when they agreed to something else', () => {
      consentTo(['measurement']);
      const container = renderTrigger('https://example.com/embed', 'A video');

      runBlockBehaviors(document, consentGatedEmbedBehaviors);

      expect(container.querySelector('button')).not.toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
    });

    it('gets it when they agree afterwards, without a click', () => {
      let granted = false;
      window.kometioConsent = {
        get: () => null,
        has: (category: string) => granted && category === 'experience',
        apply: () => undefined,
        openPreferences: () => undefined,
      };
      const container = renderTrigger('https://example.com/embed', 'A video');
      runBlockBehaviors(document, consentGatedEmbedBehaviors);
      expect(container.querySelector('iframe')).toBeNull();

      granted = true;
      document.dispatchEvent(new CustomEvent('kometio-consent-updated'));

      expect(container.querySelector('iframe')).not.toBeNull();
      expect(container.querySelector('button')).toBeNull();
    });

    it('uses the category the embed names, and experience when it names none', () => {
      consentTo(['functionality']);
      document.body.innerHTML = `
        <div class="kometio-consent-embed">
          <button type="button" class="kometio-consent-embed__trigger"
            data-embed-src="https://example.com/a" data-embed-title="A"
            data-embed-category="functionality">Load</button>
        </div>`;

      runBlockBehaviors(document, consentGatedEmbedBehaviors);

      expect(document.querySelector('iframe')).not.toBeNull();
    });

    it('does nothing where there is no consent API at all: the click still works', () => {
      const container = renderTrigger('https://example.com/embed', 'A video');

      runBlockBehaviors(document, consentGatedEmbedBehaviors);

      expect(container.querySelector('iframe')).toBeNull();
      container.querySelector<HTMLButtonElement>('button')?.click();
      expect(container.querySelector('iframe')).not.toBeNull();
    });
  });
});
