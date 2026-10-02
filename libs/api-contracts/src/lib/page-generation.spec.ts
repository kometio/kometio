import { describe, expect, it } from 'vitest';
import {
  generatePageEventSchema,
  siteAiSettingsInputSchema,
} from './page-generation';

describe('siteAiSettingsInputSchema', () => {
  const claude = {
    provider: 'anthropic',
    model: 'claude-opus-5',
    baseUrl: null,
  };

  it('takes Claude without an address, and a key that is absent, null or new', () => {
    expect(siteAiSettingsInputSchema.safeParse(claude).success).toBe(true);
    expect(
      siteAiSettingsInputSchema.safeParse({ ...claude, apiKey: null }).success,
    ).toBe(true);
    expect(
      siteAiSettingsInputSchema.safeParse({ ...claude, apiKey: ' sk-x ' }).data
        ?.apiKey,
    ).toBe('sk-x');
  });

  it('needs an http(s) address for an OpenAI-compatible server', () => {
    const local = { provider: 'openai-compatible', model: 'qwen3:14b' };
    expect(
      siteAiSettingsInputSchema.safeParse({ ...local, baseUrl: null }).success,
    ).toBe(false);
    expect(
      siteAiSettingsInputSchema.safeParse({
        ...local,
        baseUrl: 'file:///etc/passwd',
      }).success,
    ).toBe(false);
    expect(
      siteAiSettingsInputSchema.safeParse({
        ...local,
        baseUrl: 'http://localhost:11434/v1',
      }).success,
    ).toBe(true);
  });

  it('refuses a user or a token written into the address', () => {
    const local = { provider: 'openai-compatible', model: 'qwen3:14b' };
    for (const baseUrl of [
      'https://user:secret@api.example.com/v1',
      'http://token@localhost:11434/v1',
    ]) {
      expect(
        siteAiSettingsInputSchema.safeParse({ ...local, baseUrl }).success,
        baseUrl,
      ).toBe(false);
    }
    // An @ further along is not a user.
    expect(
      siteAiSettingsInputSchema.safeParse({
        ...local,
        baseUrl: 'https://api.example.com/v1/@team',
      }).success,
    ).toBe(true);
  });

  it('refuses an empty model and an unknown provider', () => {
    expect(
      siteAiSettingsInputSchema.safeParse({ ...claude, model: '  ' }).success,
    ).toBe(false);
    expect(
      siteAiSettingsInputSchema.safeParse({ ...claude, provider: 'gemini' })
        .success,
    ).toBe(false);
  });
});

describe('generatePageEventSchema', () => {
  it('reads the three events the stream sends, and refuses anything else', () => {
    expect(
      generatePageEventSchema.parse({
        event: 'error',
        data: { failure: 'rate-limited' },
      }),
    ).toEqual({ event: 'error', data: { failure: 'rate-limited' } });
    expect(
      generatePageEventSchema.safeParse({
        event: 'error',
        data: { failure: 'something-new' },
      }).success,
    ).toBe(false);
    expect(
      generatePageEventSchema.safeParse({ event: 'ping', data: {} }).success,
    ).toBe(false);
  });
});
