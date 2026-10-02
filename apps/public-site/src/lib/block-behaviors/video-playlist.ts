import type { BlockBehavior } from './types';

const INITIALIZED_ATTR = 'data-kometio-video-playlist-initialized';
const READY_ATTR = 'data-kometio-video-playlist-ready';
const HIDDEN_CLASS = 'kometio-video-playlist__item--hidden';

/**
 * What the stage holds that is not a video. In the canvas a re-rendered
 * video arrives with its own `<script>` beside it, and counting that as a
 * video made the list and the stage disagree.
 */
const NOT_A_VIDEO = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK']);

/**
 * A playlist's videos: one shown, the list switching between them.
 *
 * The videos are looked up each time rather than remembered: the canvas
 * replaces a video it re-renders, and a remembered list would go on hiding
 * and showing an element that is no longer on the page. For the same
 * reason the stage is watched, so a video swapped in by the canvas is
 * shown or hidden like the one it replaced.
 *
 * A video left playing when another is chosen would go on talking behind
 * it, so a player that had been started is reloaded as it is hidden —
 * which stops it, and puts it back at its start for the next time.
 */
function wireVideoPlaylist(root: HTMLElement): void {
  if (root.hasAttribute(INITIALIZED_ATTR)) return;
  root.setAttribute(INITIALIZED_ATTR, '');

  const stage = root.querySelector<HTMLElement>(
    '.kometio-video-playlist__stage',
  );
  if (!stage) return;
  const choices = () =>
    Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        '.kometio-video-playlist__choice',
      ),
    );
  const videos = () =>
    Array.from(stage.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !NOT_A_VIDEO.has(child.tagName),
    );

  let current = 0;
  const show = (index: number) => {
    const items = videos();
    const buttons = choices();
    // A list that does not match the videos (a canvas edit half-applied)
    // would switch to the wrong one: show them all rather than guess.
    if (buttons.length < 2 || buttons.length !== items.length) {
      items.forEach((video) => video.classList.remove(HIDDEN_CLASS));
      return;
    }
    current = index;
    items.forEach((video, i) => {
      const hide = i !== index;
      if (hide && !video.classList.contains(HIDDEN_CLASS)) {
        video.querySelectorAll('iframe').forEach((player) => {
          // Setting `src` again, even to the same address, navigates the
          // frame afresh: the player is reloaded, and stops.
          const address = player.src;
          player.src = address;
        });
      }
      video.classList.toggle(HIDDEN_CLASS, hide);
    });
    buttons.forEach((choice, i) => {
      choice.setAttribute('aria-pressed', String(i === index));
    });
  };

  root.addEventListener('click', (event) => {
    const target = event.target;
    const choice =
      target instanceof Element
        ? target.closest<HTMLButtonElement>('.kometio-video-playlist__choice')
        : null;
    if (!choice) return;
    const index = choices().indexOf(choice);
    if (index !== -1) show(index);
  });

  const view = root.ownerDocument.defaultView;
  if (view?.MutationObserver) {
    new view.MutationObserver(() => show(current)).observe(stage, {
      childList: true,
    });
  }

  show(0);
  root.setAttribute(READY_ATTR, '');
}

export const videoPlaylistBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-video-playlist]', wire: wireVideoPlaylist },
];
