import { describe, expect, it } from 'vitest';
import { referrerPolicyFor } from './referrer-policy';

describe('referrerPolicyFor', () => {
  it('sends no referrer from a preview, whose address carries its token', () => {
    expect(referrerPolicyFor('/preview/page-1')).toBe('no-referrer');
    expect(referrerPolicyFor('/preview/sections/s-1')).toBe('no-referrer');
  });

  it('sends only the origin across sites from every other page', () => {
    expect(referrerPolicyFor('/it/chi-siamo')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(referrerPolicyFor('/previews-of-our-work')).toBe(
      'strict-origin-when-cross-origin',
    );
  });
});
