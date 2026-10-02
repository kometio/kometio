import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PROMO_BAR_DISMISS_SCRIPT } from '../components/blocks/promo-bar-dismiss-script';
import { COOKIE_CONSENT_DISMISS_SCRIPT } from '../components/cookie-consent-dismiss-script';
import {
  buildContentSecurityPolicy,
  injectScriptNonce,
} from './content-security-policy';

describe('buildContentSecurityPolicy', () => {
  it('includes the exact hash of the promo bar dismiss script', () => {
    const expectedHash = createHash('sha256')
      .update(PROMO_BAR_DISMISS_SCRIPT)
      .digest('base64');

    expect(buildContentSecurityPolicy(`'self'`, 'abc123')).toContain(
      `'sha256-${expectedHash}'`,
    );
  });

  it('includes the exact hash of the cookie consent dismiss script', () => {
    const expectedHash = createHash('sha256')
      .update(COOKIE_CONSENT_DISMISS_SCRIPT)
      .digest('base64');

    expect(buildContentSecurityPolicy(`'self'`, 'abc123')).toContain(
      `'sha256-${expectedHash}'`,
    );
  });

  it('sets the given value as frame-ancestors, nothing else', () => {
    const policy = buildContentSecurityPolicy(
      'http://localhost:4200',
      'abc123',
    );

    expect(policy).toContain('frame-ancestors http://localhost:4200');
    expect(policy).not.toContain(`frame-ancestors 'self'`);
  });

  it('includes the given nonce in script-src', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'the-request-nonce');

    expect(policy).toContain(`'nonce-the-request-nonce'`);
  });

  it('never allows unsafe-inline or unsafe-eval for scripts', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123');
    const scriptSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('allows the exact iframe origins VideoEmbed/MapEmbed/Turnstile need', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123');
    const frameSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('frame-src'));

    expect(frameSrc).toContain('https://challenges.cloudflare.com');
    expect(frameSrc).toContain('https://www.youtube-nocookie.com');
    expect(frameSrc).toContain('https://player.vimeo.com');
    expect(frameSrc).toContain('https://www.google.com');
  });

  it('allows the booking services BookingEmbed frames, and no look-alike of them', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123');
    const frameSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('frame-src'));
    const sources = frameSrc?.trim().split(/\s+/).slice(1) ?? [];

    expect(sources).toEqual(
      expect.arrayContaining([
        'https://calendly.com',
        'https://cal.com',
        'https://app.cal.com',
        'https://calendar.google.com',
      ]),
    );
    // Exact hosts, never a wildcard that would let any subdomain in.
    expect(sources.some((source) => source.includes('*'))).toBe(false);
  });

  it('allows the GTM/GA4/Meta Pixel origins the Tier 1 head/body script field needs', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123');
    const scriptSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('script-src'))!;
    const connectSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src'))!;
    const imgSrc = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('img-src'))!;

    expect(scriptSrc).toContain('https://www.googletagmanager.com');
    expect(scriptSrc).toContain('https://connect.facebook.net');
    expect(connectSrc).toContain('https://www.googletagmanager.com');
    expect(connectSrc).toContain('https://www.google-analytics.com');
    expect(connectSrc).toContain('https://*.google-analytics.com');
    expect(connectSrc).toContain('https://*.analytics.google.com');
    expect(connectSrc).toContain('https://www.facebook.com');
    expect(imgSrc).toContain('https://www.facebook.com');
  });

  it('blocks plugins and base-tag hijacking unconditionally', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123');

    expect(policy).toContain(`object-src 'none'`);
    expect(policy).toContain(`base-uri 'self'`);
  });

  it('adds ADR-0031 tracker whitelist domains to script-src/connect-src/frame-src, prefixed with https://', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123', [
      { label: 'Hotjar', domain: 'static.hotjar.com' },
      { label: 'Hotjar API', domain: '*.hotjar.io' },
    ]);
    const directive = (name: string) =>
      policy.split(';').find((d) => d.trim().startsWith(name))!;

    expect(directive('script-src')).toContain('https://static.hotjar.com');
    expect(directive('connect-src')).toContain('https://*.hotjar.io');
    expect(directive('frame-src')).toContain('https://static.hotjar.com');
  });

  it('does not add tracker whitelist domains to img-src/font-src/style-src (already https: wildcarded)', () => {
    const policy = buildContentSecurityPolicy(`'self'`, 'abc123', [
      { label: 'Hotjar', domain: 'static.hotjar.com' },
    ]);
    const directive = (name: string) =>
      policy.split(';').find((d) => d.trim().startsWith(name))!;

    expect(directive('img-src')).not.toContain('static.hotjar.com');
    expect(directive('font-src')).not.toContain('static.hotjar.com');
    expect(directive('style-src')).not.toContain('static.hotjar.com');
  });

  it('adds nothing extra when no tracker domains are configured', () => {
    const withEmpty = buildContentSecurityPolicy(`'self'`, 'abc123', []);
    const withDefault = buildContentSecurityPolicy(`'self'`, 'abc123');

    expect(withEmpty).toBe(withDefault);
  });
});

describe('injectScriptNonce', () => {
  it('adds the nonce attribute to a plain <script> tag', () => {
    expect(injectScriptNonce('<script>doStuff();</script>', 'n0nce')).toBe(
      '<script nonce="n0nce">doStuff();</script>',
    );
  });

  it('adds the nonce to every <script> tag in a multi-tag snippet', () => {
    const html =
      '<script>first();</script><script src="https://example.com/x.js"></script>';

    expect(injectScriptNonce(html, 'n0nce')).toBe(
      '<script nonce="n0nce">first();</script><script nonce="n0nce" src="https://example.com/x.js"></script>',
    );
  });

  it('preserves existing attributes on the tag', () => {
    const html = '<script async src="https://example.com/x.js"></script>';

    expect(injectScriptNonce(html, 'n0nce')).toBe(
      '<script nonce="n0nce" async src="https://example.com/x.js"></script>',
    );
  });

  it('matches an uppercase <SCRIPT> tag too (HTML tag names are case-insensitive)', () => {
    expect(injectScriptNonce('<SCRIPT>doStuff();</SCRIPT>', 'n0nce')).toBe(
      '<script nonce="n0nce">doStuff();</SCRIPT>',
    );
  });

  it('does not double-add a nonce when one is already present', () => {
    const html = '<script nonce="existing">doStuff();</script>';

    expect(injectScriptNonce(html, 'n0nce')).toBe(html);
  });

  it('does not mistake an unrelated attribute ending in "nonce" for a real nonce attribute', () => {
    const html = '<script data-nonce="x">doStuff();</script>';

    expect(injectScriptNonce(html, 'n0nce')).toBe(
      '<script nonce="n0nce" data-nonce="x">doStuff();</script>',
    );
  });

  it('leaves non-script HTML untouched', () => {
    expect(injectScriptNonce('<div>hello</div>', 'n0nce')).toBe(
      '<div>hello</div>',
    );
  });
});
