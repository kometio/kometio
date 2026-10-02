import { describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

describe('generateOpaqueToken', () => {
  it('generates a high-entropy, non-empty token', () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it('generates a different token every call', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe('hashOpaqueToken', () => {
  it('is deterministic for the same input', () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it('never returns the plaintext token itself', () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).not.toBe(token);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashOpaqueToken(generateOpaqueToken())).not.toBe(
      hashOpaqueToken(generateOpaqueToken()),
    );
  });
});
