// Every component under test may call useTranslation() — initialize the
// real i18next instance once here instead of in every spec file.
import { afterEach, beforeEach } from 'vitest';
import i18next from './i18n';

// i18next is a global singleton: a test that switches language (see
// language-switcher.spec.tsx) would otherwise leak that choice into every
// test file that runs after it. Pinned to 'it' regardless of `i18n.ts`'s
// own real-app default (`en`) — every existing assertion was written
// against Italian copy, and a test suite's own language is an explicit,
// controlled choice, not something that should move just because the
// app's default did. `beforeEach` covers the very first test in a run,
// which `afterEach` alone never reaches.
beforeEach(() => {
  void i18next.changeLanguage('it');
});
afterEach(() => {
  void i18next.changeLanguage('it');
});

// jsdom doesn't implement ResizeObserver — Puck's drag-and-drop (@dnd-kit)
// needs it just to be importable, even in tests that never actually drag
// anything.
class ResizeObserverStub {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom doesn't implement matchMedia either — Puck uses it for viewport
// detection.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// jsdom doesn't implement the Pointer Capture methods — block-picker.tsx's
// drag-to-insert (Pointer Capture instead of a real HTML5 drag, so the
// drag keeps receiving events even while the cursor is visually over the
// iframe) calls `setPointerCapture` on every pointerdown, real or
// simulated.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;

// jsdom doesn't implement scrollIntoView either — Radix's Select scrolls
// the highlighted item into view when its dropdown opens, real or
// simulated.
Element.prototype.scrollIntoView ??= () => undefined;

// jsdom never loads the real Cloudflare Turnstile script (login/forgot-
// password widget, security review 2026-08-24, point 13) — this fires the
// widget's callback immediately with a fixed fake token on render, so every
// existing fill-and-submit test flow keeps working unchanged without
// knowing Turnstile exists. A test that specifically cares about the
// pre-token disabled state overrides `window.turnstile` for itself.
window.turnstile ??= {
  render: (_container, options) => {
    options.callback('fake-turnstile-token-for-tests');
    return 'fake-widget-id';
  },
  reset: () => undefined,
  remove: () => undefined,
};
