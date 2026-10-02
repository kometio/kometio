// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { videoPlaylistBehaviors } from './video-playlist';
import { runBlockBehaviors } from './run-block-behaviors';

function playlist(videoCount: number, choiceCount = videoCount): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-kometio-video-playlist', '');
  const videos = Array.from(
    { length: videoCount },
    (_, i) => `<figure data-video="${i}"><button>Load</button></figure>`,
  ).join('');
  const choices = Array.from(
    { length: choiceCount },
    (_, i) =>
      `<li><button class="kometio-video-playlist__choice" aria-pressed="${i === 0}">Video ${i + 1}</button></li>`,
  ).join('');
  root.innerHTML = `<div class="kometio-video-playlist__stage">${videos}</div><ol>${choices}</ol>`;
  document.body.append(root);
  return root;
}

const hiddenFlags = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('figure')).map((video) =>
    video.classList.contains('kometio-video-playlist__item--hidden'),
  );

describe('video playlist', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the first video and hides the rest once ready', () => {
    const root = playlist(3);
    runBlockBehaviors(document, videoPlaylistBehaviors);

    expect(hiddenFlags(root)).toEqual([false, true, true]);
    expect(root.hasAttribute('data-kometio-video-playlist-ready')).toBe(true);
  });

  it('switches to the chosen video and marks its title pressed', () => {
    const root = playlist(3);
    runBlockBehaviors(document, videoPlaylistBehaviors);

    root
      .querySelectorAll<HTMLButtonElement>('.kometio-video-playlist__choice')[2]
      ?.click();

    expect(hiddenFlags(root)).toEqual([true, true, false]);
    const pressed = Array.from(
      root.querySelectorAll('.kometio-video-playlist__choice'),
    ).map((choice) => choice.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'false', 'true']);
  });

  it('reloads a player that is being hidden, so it stops talking', () => {
    const root = playlist(2);
    runBlockBehaviors(document, videoPlaylistBehaviors);
    const first = root.querySelector('figure');
    if (!first) throw new Error('fixture has no video');
    const player = document.createElement('iframe');
    player.src = 'https://www.youtube-nocookie.com/embed/abc';
    first.append(player);
    let reloaded = false;
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      'src',
    );
    Object.defineProperty(player, 'src', {
      get: () => descriptor?.get?.call(player),
      set: (value: string) => {
        reloaded = true;
        descriptor?.set?.call(player, value);
      },
    });

    root
      .querySelectorAll<HTMLButtonElement>('.kometio-video-playlist__choice')[1]
      ?.click();

    expect(reloaded).toBe(true);
  });

  it('does nothing when the list and the videos disagree, rather than switch to the wrong one', () => {
    const root = playlist(3, 2);
    runBlockBehaviors(document, videoPlaylistBehaviors);

    expect(hiddenFlags(root)).toEqual([false, false, false]);
    // Ready, so the stylesheet's "only the first until ready" stops
    // hiding the other two as well.
    expect(root.hasAttribute('data-kometio-video-playlist-ready')).toBe(true);
  });

  /*
   * Found live in the canvas: re-rendering one video replaced its element
   * and put a <script> beside it, and the playlist — which had remembered
   * its videos — showed both and switched nothing.
   */
  it('keeps one video showing when the canvas swaps a video and adds a script beside it', async () => {
    const root = playlist(2);
    runBlockBehaviors(document, videoPlaylistBehaviors);
    const stage = root.querySelector('.kometio-video-playlist__stage');
    const second = root.querySelectorAll('figure')[1];
    if (!stage || !second) throw new Error('fixture has no stage');

    const replacement = document.createElement('figure');
    replacement.dataset['video'] = '1-new';
    second.replaceWith(replacement);
    stage.append(document.createElement('script'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hiddenFlags(root)).toEqual([false, true]);

    root
      .querySelectorAll<HTMLButtonElement>('.kometio-video-playlist__choice')[1]
      ?.click();
    expect(hiddenFlags(root)).toEqual([true, false]);
  });
});
