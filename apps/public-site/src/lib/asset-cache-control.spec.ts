import { describe, expect, it } from 'vitest';
import { cacheControlFor } from '../../asset-cache-control.mjs';

describe('cacheControlFor', () => {
  it('keeps the build’s hashed bundles for a year, and says they never change', () => {
    expect(cacheControlFor('/_astro/PageLayout.5iAZ5E_Q.css')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(cacheControlFor('/_astro/hoisted.abc123.js?v=1')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it.each([
    '/',
    '/en/about',
    '/favicon.svg',
    '/_image?href=/uploads/a.webp&w=300',
    '/api/health',
    '/_astroish/file.js',
  ])(
    'says nothing about %s: it is rendered per request or is not hashed',
    (url) => {
      expect(cacheControlFor(url)).toBeUndefined();
    },
  );

  it('says nothing when there is no URL', () => {
    expect(cacheControlFor(undefined)).toBeUndefined();
  });
});
