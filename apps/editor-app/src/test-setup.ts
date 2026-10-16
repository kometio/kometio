// Every component under test may call useTranslation() — initialize the
// real i18next instance once here instead of in every spec file.
import { afterEach, beforeEach, vi } from 'vitest';
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

// jsdom doesn't implement ResizeObserver — the editor's drag-and-drop
// (@dnd-kit) needs it just to be importable, even in tests that never
// actually drag anything.
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

// jsdom doesn't implement matchMedia either — the editor reads it for the
// theme and for narrow viewports.
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

// The captcha widget (login/forgot-password, security review 2026-08-24, point
// 13) is a download of its own that runs a proof of work in a worker: it never
// loads in jsdom. Every test gets a stand-in that hands over a fixed token as
// soon as it is drawn, so each fill-and-submit flow works unchanged without
// knowing a captcha exists. A test that cares about the moment before the
// visitor has solved anything says so (`captchaStaysUnsolved`), and the
// widget's own spec takes the real one back (`vi.unmock`).
vi.mock('./app/auth/altcha-widget', async () => {
  const { FakeAltchaWidget } = await import('./test/fake-captcha');
  return { AltchaWidget: FakeAltchaWidget };
});
