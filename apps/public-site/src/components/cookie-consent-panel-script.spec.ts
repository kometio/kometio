// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_CONSENT_PANEL_SCRIPT } from './cookie-consent-panel-script';

// Real markup shape, not a simplification — matches CookieConsent.astro's
// own template exactly (docs/adr/0039), since this test exists specifically
// to catch a regression in how this script wires up to that markup.
const BANNER_HTML = `
  <div data-kometio-cookie-consent>
    <button type="button" data-kometio-consent-action="accept">Accept</button>
    <button type="button" data-kometio-consent-action="customize">Customize</button>
    <button type="button" data-kometio-consent-action="reject">Reject</button>
    <div data-kometio-consent-panel hidden>
      <input type="checkbox" data-kometio-consent-category="functionality" />
      <input type="checkbox" data-kometio-consent-category="measurement" />
      <input type="checkbox" data-kometio-consent-category="experience" />
      <button type="button" data-kometio-consent-action="save">Save</button>
    </div>
  </div>
  <button type="button" class="kometio-cookie-consent-reopen" hidden></button>
`;

function runScript() {
  // Same as a browser executing the real `is:inline` script tag.
  (0, eval)(COOKIE_CONSENT_PANEL_SCRIPT);
}

function category(name: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(
    `[data-kometio-consent-category="${name}"]`,
  )!;
}

function click(selector: string) {
  document.querySelector<HTMLElement>(selector)?.click();
}

describe('COOKIE_CONSENT_PANEL_SCRIPT', () => {
  let kometioConsent: {
    get: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    document.body.innerHTML = BANNER_HTML;
    kometioConsent = { get: vi.fn(() => null), apply: vi.fn() };
    window.kometioConsent =
      kometioConsent as unknown as typeof window.kometioConsent;
  });

  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of a global this script defines.
    delete window.kometioConsent;
  });

  it('accept grants every category and hides the banner', () => {
    runScript();

    click('[data-kometio-consent-action="accept"]');

    expect(kometioConsent.apply).toHaveBeenCalledWith({
      functionality: true,
      measurement: true,
      experience: true,
    });
    expect(
      document
        .querySelector('[data-kometio-cookie-consent]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });

  it('reject withholds every category and hides the banner', () => {
    runScript();

    click('[data-kometio-consent-action="reject"]');

    expect(kometioConsent.apply).toHaveBeenCalledWith({
      functionality: false,
      measurement: false,
      experience: false,
    });
  });

  it('customize opens the panel without applying anything', () => {
    runScript();

    click('[data-kometio-consent-action="customize"]');

    expect(
      document
        .querySelector('[data-kometio-consent-panel]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(kometioConsent.apply).not.toHaveBeenCalled();
  });

  it('save applies exactly the checked categories and hides the banner', () => {
    runScript();
    category('measurement').checked = true;

    click('[data-kometio-consent-action="save"]');

    expect(kometioConsent.apply).toHaveBeenCalledWith({
      functionality: false,
      measurement: true,
      experience: false,
    });
    expect(
      document
        .querySelector('[data-kometio-cookie-consent]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });

  it('reveals the reopen tab after hiding the banner, and reopening shows the panel pre-filled', () => {
    kometioConsent.get.mockReturnValue({
      v: 1,
      id: 'x',
      ts: 'now',
      cats: { functionality: false, measurement: true, experience: false },
    });
    runScript();

    click('[data-kometio-consent-action="accept"]');
    expect(
      document
        .querySelector('.kometio-cookie-consent-reopen')
        ?.hasAttribute('hidden'),
    ).toBe(false);

    click('.kometio-cookie-consent-reopen');

    expect(
      document
        .querySelector('[data-kometio-cookie-consent]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      document
        .querySelector('[data-kometio-consent-panel]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(category('measurement').checked).toBe(true);
    expect(category('functionality').checked).toBe(false);
  });

  it('opens the panel in response to a kometio-consent-open-preferences event', () => {
    runScript();

    document.dispatchEvent(new Event('kometio-consent-open-preferences'));

    expect(
      document
        .querySelector('[data-kometio-consent-panel]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('ignores clicks that are not on a known action', () => {
    runScript();

    document
      .querySelector('[data-kometio-cookie-consent]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(kometioConsent.apply).not.toHaveBeenCalled();
  });
});
