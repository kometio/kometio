// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionIsOff } from './motion-preference';
import { preferredScrollBehavior } from './scroll-behavior';

function systemAsksForLess(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-kometio-motion');
});

describe('motionIsOff', () => {
  it('is false when nobody asked for stillness', () => {
    systemAsksForLess(false);

    expect(motionIsOff()).toBe(false);
  });

  it('is true for a reader who asked their system for less', () => {
    systemAsksForLess(true);

    expect(motionIsOff()).toBe(true);
  });

  it('is true for a site whose owner turned motion off, whatever the system says', () => {
    systemAsksForLess(false);
    document.documentElement.setAttribute('data-kometio-motion', 'off');

    expect(motionIsOff()).toBe(true);
  });

  it('does not take any other value of the attribute for a no', () => {
    systemAsksForLess(false);
    document.documentElement.setAttribute('data-kometio-motion', 'on');

    expect(motionIsOff()).toBe(false);
  });

  it('is read on every call: the system setting can change while the page is open', () => {
    systemAsksForLess(false);
    expect(motionIsOff()).toBe(false);

    systemAsksForLess(true);
    expect(motionIsOff()).toBe(true);
  });
});

describe('the scroll behaviour that follows it', () => {
  it('is smooth while motion is on', () => {
    systemAsksForLess(false);

    expect(preferredScrollBehavior()).toBe('smooth');
  });

  it('is instant when the site does not move: an explicit smooth is an argument, not a declaration, and no stylesheet can override it', () => {
    systemAsksForLess(false);
    document.documentElement.setAttribute('data-kometio-motion', 'off');

    expect(preferredScrollBehavior()).toBe('auto');
  });
});
