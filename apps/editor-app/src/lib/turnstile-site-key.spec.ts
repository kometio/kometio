import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileSiteKey } from './turnstile-site-key';

/**
 * The key reaches the editor two ways, in this order: what the container wrote
 * when it started, what the build knew (docs/adr/0076, amended 2026-10-02).
 * An empty value is "unset" at each step, and without one the captcha is the
 * one built into Kometio (docs/adr/0103): `null`.
 */
describe('turnstileSiteKey', () => {
  afterEach(() => {
    delete window.__KOMETIO_CONFIG__;
    vi.unstubAllEnvs();
  });

  it('prefers what the container wrote over what the build knew', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0xbuilt');
    window.__KOMETIO_CONFIG__ = { turnstileSiteKey: '0xcontainer' };

    expect(turnstileSiteKey()).toBe('0xcontainer');
  });

  it('uses the build-time key when the container wrote none', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0xbuilt');
    window.__KOMETIO_CONFIG__ = { turnstileSiteKey: '' };

    expect(turnstileSiteKey()).toBe('0xbuilt');
  });

  /*
   * The published image is built without a key, and the build turns that
   * into the empty string. `??` does not take "" for unset, so the widget
   * used to be handed "" — it raised `Invalid input for parameter "sitekey"`
   * and the login button stayed disabled for everyone who pulled the image.
   */
  it('takes an empty build-time key for unset, as a published image has', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');

    expect(turnstileSiteKey()).toBeNull();
  });

  // It used to be Cloudflare's test key, a captcha that passes everybody.
  it('is null when nothing was set anywhere: the captcha built into Kometio, not one that lets everybody through', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);

    expect(turnstileSiteKey()).toBeNull();
  });

  it('treats a placeholder the container never replaced as unset', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    // The literal placeholder is the point: it is what envsubst leaves.
    // eslint-disable-next-line no-template-curly-in-string
    const placeholder = '${KOMETIO_TURNSTILE_SITE_KEY}';
    window.__KOMETIO_CONFIG__ = { turnstileSiteKey: placeholder };

    expect(turnstileSiteKey()).toBeNull();
  });
});
