import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileSiteKey } from './turnstile-site-key';

/** Cloudflare's "always passes" test site key. */
const TEST_KEY = '1x00000000000000000000AA';

/**
 * The key reaches the editor three ways, in this order: what the container
 * wrote when it started, what the build knew, Cloudflare's test key
 * (docs/adr/0076, amended 2026-10-02). An empty value is "unset" at each step.
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

    expect(turnstileSiteKey()).toBe(TEST_KEY);
  });

  it('falls back to the test key when nothing was set anywhere', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);

    expect(turnstileSiteKey()).toBe(TEST_KEY);
  });

  it('treats a placeholder the container never replaced as unset', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    // The literal placeholder is the point: it is what envsubst leaves.
    // eslint-disable-next-line no-template-curly-in-string
    const placeholder = '${KOMETIO_TURNSTILE_SITE_KEY}';
    window.__KOMETIO_CONFIG__ = { turnstileSiteKey: placeholder };

    expect(turnstileSiteKey()).toBe(TEST_KEY);
  });
});
