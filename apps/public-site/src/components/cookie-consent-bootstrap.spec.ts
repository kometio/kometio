// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCookieConsentBootstrap } from './cookie-consent-bootstrap';

const NONCE = 'test-nonce-123';

function runBootstrap() {
  // Same as a browser executing the real `is:inline` script tag — the
  // generated source is a self-contained IIFE that assigns
  // `window.kometioConsent`, nothing here needs its return value.
  (0, eval)(buildCookieConsentBootstrap(NONCE));
}

function setCookie(value: object) {
  document.cookie = `kometio_consent=${encodeURIComponent(JSON.stringify(value))}; Path=/`;
}

function clearCookies() {
  document.cookie = 'kometio_consent=; Path=/; Max-Age=0';
}

describe('buildCookieConsentBootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearCookies();
  });

  afterEach(() => {
    clearCookies();
    // @ts-expect-error -- test-only cleanup of a global this script defines.
    delete window.kometioConsent;
  });

  it('exposes window.kometioConsent with no cookie set', () => {
    runBootstrap();

    expect(window.kometioConsent.get()).toBeNull();
    expect(window.kometioConsent.has('necessary')).toBe(true);
    expect(window.kometioConsent.has('measurement')).toBe(false);
  });

  it('reads an existing consent cookie', () => {
    setCookie({ v: 1, id: 'x', ts: 'now', cats: { measurement: true } });

    runBootstrap();

    expect(window.kometioConsent.has('measurement')).toBe(true);
    expect(window.kometioConsent.has('experience')).toBe(false);
  });

  it('activates a matching gated template already in the DOM', () => {
    document.body.innerHTML =
      '<template data-kometio-consent="measurement" data-kometio-id="a1"><span id="marker">activated</span></template>';
    setCookie({ v: 1, id: 'x', ts: 'now', cats: { measurement: true } });

    runBootstrap();

    expect(document.querySelector('template')).toBeNull();
    expect(document.getElementById('marker')).not.toBeNull();
  });

  it('does not activate a template for a category not yet consented', () => {
    document.body.innerHTML =
      '<template data-kometio-consent="measurement" data-kometio-id="a1"><span id="marker">activated</span></template>';

    runBootstrap();

    expect(document.querySelector('template')).not.toBeNull();
    expect(document.getElementById('marker')).toBeNull();
  });

  it('stamps the real nonce onto a script cloned out of an activated template', () => {
    document.body.innerHTML =
      '<template data-kometio-consent="measurement" data-kometio-id="a1"><script>window.__ran = true;</script></template>';
    setCookie({ v: 1, id: 'x', ts: 'now', cats: { measurement: true } });

    runBootstrap();

    const script = document.querySelector<HTMLScriptElement>('script[nonce]');
    expect(script?.nonce).toBe(NONCE);
  });

  it('apply() writes a consent cookie and activates newly-granted templates', () => {
    document.body.innerHTML =
      '<template data-kometio-consent="experience" data-kometio-id="a1"><span id="marker">activated</span></template>';

    runBootstrap();
    window.kometioConsent.apply({
      functionality: false,
      measurement: false,
      experience: true,
    });

    expect(document.getElementById('marker')).not.toBeNull();
    const record = window.kometioConsent.get();
    expect(record?.cats.experience).toBe(true);
    expect(record?.cats.measurement).toBe(false);
    expect(record?.id).toBeTruthy();
  });

  it('openPreferences() dispatches a document event the banner UI listens for', () => {
    runBootstrap();
    let received = false;
    document.addEventListener('kometio-consent-open-preferences', () => {
      received = true;
    });

    window.kometioConsent.openPreferences();

    expect(received).toBe(true);
  });
});
