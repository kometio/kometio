// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { embedHtmlBehaviors, settleEmbeds } from './embed-html';
import { runBlockBehaviors } from './run-block-behaviors';

function renderFrame(): HTMLIFrameElement {
  document.body.innerHTML = `
    <div class="kometio-embed-html">
      <iframe class="kometio-embed-html__frame"></iframe>
    </div>
  `;
  return document.querySelector<HTMLIFrameElement>(
    '.kometio-embed-html__frame',
  )!;
}

function postHeightFrom(source: Window | null, height: number) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { kometioEmbedHtmlHeight: height },
      source,
    }),
  );
}

describe('embedHtmlBehaviors', () => {
  it('sets the iframe height from a matching message event', () => {
    const frame = renderFrame();
    runBlockBehaviors(document, embedHtmlBehaviors);

    postHeightFrom(frame.contentWindow, 480);

    expect(frame.style.height).toBe('480px');
  });

  it('ignores a message from a different source', () => {
    const frame = renderFrame();
    runBlockBehaviors(document, embedHtmlBehaviors);

    postHeightFrom(window, 480);

    expect(frame.style.height).toBe('');
  });

  it('ignores a message with no numeric kometioEmbedHtmlHeight', () => {
    const frame = renderFrame();
    runBlockBehaviors(document, embedHtmlBehaviors);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { somethingElse: true },
        source: frame.contentWindow,
      }),
    );

    expect(frame.style.height).toBe('');
  });

  it('does not throw when re-run on an already-wired iframe (live-patch re-init)', () => {
    const frame = renderFrame();
    runBlockBehaviors(document, embedHtmlBehaviors);

    expect(() => runBlockBehaviors(document, embedHtmlBehaviors)).not.toThrow();

    postHeightFrom(frame.contentWindow, 200);
    expect(frame.style.height).toBe('200px');
  });
});

describe('settleEmbeds', () => {
  it('takes the note away once the embed it stood in for is there', () => {
    document.body.innerHTML = `
      <div class="kometio-embed-html" id="done">
        <p class="kometio-embed-html__consent">Waiting</p>
        <iframe class="kometio-embed-html__frame"></iframe>
      </div>
      <div class="kometio-embed-html" id="waiting">
        <p class="kometio-embed-html__consent">Waiting</p>
        <template data-kometio-consent="experience"></template>
      </div>`;

    settleEmbeds(document);

    expect(
      document.querySelector('#done .kometio-embed-html__consent'),
    ).toBeNull();
    expect(
      document.querySelector('#waiting .kometio-embed-html__consent'),
    ).not.toBeNull();
  });
});
