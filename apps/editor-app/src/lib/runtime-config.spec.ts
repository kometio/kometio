import { afterEach, describe, expect, it } from 'vitest';
import { apiBaseUrl, publicSiteUrl } from './runtime-config';

/**
 * The addresses used to be compiled into the bundle, so the published
 * image only ever worked against the host it was built for. They are read
 * at start-up now (docs/adr/0076) — from the file the container writes,
 * with the build-time value as the fallback.
 */
describe('runtime config', () => {
  afterEach(() => {
    delete window.__KOMETIO_CONFIG__;
  });

  it('prefers what the container wrote over what the build knew', () => {
    window.__KOMETIO_CONFIG__ = {
      apiUrl: 'https://api.esempio.it/api',
      publicSiteUrl: 'https://esempio.it',
    };

    expect(apiBaseUrl()).toBe('https://api.esempio.it/api');
    expect(publicSiteUrl()).toBe('https://esempio.it');
  });

  /*
   * A container started without the two variables, or a `dist/` served by
   * some other static host: the build-time value is the honest answer,
   * not a blank screen.
   */
  it('falls back to the build-time value when the file set nothing', () => {
    window.__KOMETIO_CONFIG__ = { apiUrl: '', publicSiteUrl: '' };

    expect(apiBaseUrl()).toBe(import.meta.env.VITE_API_URL);
    expect(publicSiteUrl()).toBe(import.meta.env.VITE_PUBLIC_SITE_URL);
  });

  it('falls back when the file was not served at all', () => {
    expect(apiBaseUrl()).toBe(import.meta.env.VITE_API_URL);
  });

  /*
   * envsubst leaves an unknown placeholder exactly as it found it. Sending
   * a literal `${KOMETIO_API_URL}` to fetch() would fail in a way that
   * points nowhere near the cause.
   */
  it('treats a placeholder the container never replaced as unset', () => {
    // The literal placeholder is the point: it is what envsubst leaves.
    // eslint-disable-next-line no-template-curly-in-string
    window.__KOMETIO_CONFIG__ = { apiUrl: '${KOMETIO_API_URL}' };

    expect(apiBaseUrl()).toBe(import.meta.env.VITE_API_URL);
  });
});
