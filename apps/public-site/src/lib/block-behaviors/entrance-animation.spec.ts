// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initEntranceAnimations } from './entrance-animation';

type ObserverCallback = (
  entries: { isIntersecting: boolean; target: Element }[],
  observer: { unobserve: (element: Element) => void },
) => void;

let observed: Element[] = [];
let unobserved: Element[] = [];
let trigger: ObserverCallback | null = null;

function installObserver(): void {
  observed = [];
  unobserved = [];
  trigger = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        trigger = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      unobserve(element: Element) {
        unobserved.push(element);
      }
      disconnect() {
        /* nothing to release in the fake */
      }
    },
  );
}

function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce })),
  );
}

/** Off screen, so the observer is what decides — not the load-time shortcut. */
function offScreenWrapper(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'kometio-root-block';
  wrapper.getBoundingClientRect = () =>
    ({ top: 5000, bottom: 5400 }) as DOMRect;
  document.body.append(wrapper);
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
  installObserver();
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('entrance animations', () => {
  it('marks the document ready, which is what turns the CSS on', () => {
    offScreenWrapper();
    initEntranceAnimations();
    expect(document.documentElement.classList).toContain(
      'kometio-motion-ready',
    );
  });

  it('starts a block only once it has arrived, then stops watching it', () => {
    const wrapper = offScreenWrapper();
    initEntranceAnimations();

    expect(observed).toEqual([wrapper]);
    expect(wrapper.hasAttribute('data-kometio-in-view')).toBe(false);

    trigger?.([{ isIntersecting: true, target: wrapper }], {
      unobserve: (element) => unobserved.push(element),
    });

    expect(wrapper.hasAttribute('data-kometio-in-view')).toBe(true);
    // An entrance happens once — replaying it on every scroll past would
    // be a page that will not sit still.
    expect(unobserved).toEqual([wrapper]);
  });

  it('leaves a block alone until it intersects', () => {
    const wrapper = offScreenWrapper();
    initEntranceAnimations();
    trigger?.([{ isIntersecting: false, target: wrapper }], {
      unobserve: (element) => unobserved.push(element),
    });
    expect(wrapper.hasAttribute('data-kometio-in-view')).toBe(false);
    expect(unobserved).toEqual([]);
  });

  it('does not make the first screenful wait for a callback', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'kometio-root-block';
    wrapper.getBoundingClientRect = () => ({ top: 10, bottom: 400 }) as DOMRect;
    document.body.append(wrapper);

    initEntranceAnimations();

    expect(wrapper.hasAttribute('data-kometio-in-view')).toBe(true);
    expect(observed).toEqual([]);
  });

  /*
   * Both halves matter. The CSS drops the animation under
   * prefers-reduced-motion on its own; this saves an observer nobody
   * needs, and above all never adds the ready class — so nothing can
   * leave a block on its invisible first frame.
   */
  it('does nothing at all for a reader who asked for less motion', () => {
    const wrapper = offScreenWrapper();
    setReducedMotion(true);

    initEntranceAnimations();

    expect(document.documentElement.classList).not.toContain(
      'kometio-motion-ready',
    );
    expect(observed).toEqual([]);
    expect(wrapper.hasAttribute('data-kometio-in-view')).toBe(false);
  });

  it('observes a block once, however often it is re-run', () => {
    const wrapper = offScreenWrapper();
    initEntranceAnimations();
    initEntranceAnimations();
    expect(observed).toEqual([wrapper]);
  });

  /*
   * Without IntersectionObserver the ready class would hide every block
   * behind an animation nothing could ever release. Failing to "no
   * animation" is the only acceptable direction.
   */
  it('leaves the page visible where IntersectionObserver is missing', () => {
    offScreenWrapper();
    vi.stubGlobal('IntersectionObserver', undefined);
    initEntranceAnimations();
    expect(document.documentElement.classList).not.toContain(
      'kometio-motion-ready',
    );
  });
});
