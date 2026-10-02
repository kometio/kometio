// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statBehaviors } from './stat';
import { runBlockBehaviors } from './run-block-behaviors';

type ObserverCallback = (
  entries: Array<{ isIntersecting: boolean; target: Element }>,
  observer: { unobserve: (el: Element) => void },
) => void;

let lastCallback: ObserverCallback | null = null;
const observe = vi.fn();
const unobserve = vi.fn();

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    lastCallback = callback;
  }
  observe = observe;
  unobserve = unobserve;
  disconnect = vi.fn();
}

function renderStat(value: string): HTMLElement {
  document.body.innerHTML = `
    <div class="kometio-stat" data-value="${value}">
      <span class="kometio-stat__number" data-current="0">0</span>
    </div>
  `;
  return document.querySelector<HTMLElement>('.kometio-stat')!;
}

describe('statBehaviors', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // reduced motion: jump straight to target, no rAF loop to fake
    lastCallback = null;
    observe.mockClear();
    unobserve.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('animates the number to its target once the element intersects', () => {
    const root = renderStat('42');

    runBlockBehaviors(document, statBehaviors);

    expect(observe).toHaveBeenCalledWith(root);
    lastCallback?.([{ isIntersecting: true, target: root }], { unobserve });

    expect(root.querySelector('.kometio-stat__number')?.textContent).toBe('42');
    expect(unobserve).toHaveBeenCalledWith(root);
  });

  it('ignores an entry that is not yet intersecting', () => {
    const root = renderStat('42');
    runBlockBehaviors(document, statBehaviors);

    lastCallback?.([{ isIntersecting: false, target: root }], { unobserve });

    expect(root.querySelector('.kometio-stat__number')?.textContent).toBe('0');
    expect(unobserve).not.toHaveBeenCalled();
  });

  it('is idempotent: a second run only observes once', () => {
    renderStat('42');

    runBlockBehaviors(document, statBehaviors);
    runBlockBehaviors(document, statBehaviors);

    expect(observe).toHaveBeenCalledTimes(1);
  });
});
