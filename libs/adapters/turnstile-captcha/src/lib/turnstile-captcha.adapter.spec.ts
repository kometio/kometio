import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileCaptchaAdapter } from './turnstile-captcha.adapter';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('TurnstileCaptchaAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false without calling the network when the token is blank', async () => {
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    const result = await adapter.verify({ token: '' });

    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the secret and token to the siteverify endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    const result = await adapter.verify({ token: 'abc', remoteIp: '1.2.3.4' });

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          secret: 'secret',
          response: 'abc',
          remoteip: '1.2.3.4',
        }),
      }),
    );
  });

  it('omits remoteip when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    await adapter.verify({ token: 'abc' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ secret: 'secret', response: 'abc' }),
      }),
    );
  });

  it('returns false when Cloudflare rejects the token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    );
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    const result = await adapter.verify({ token: 'expired-token' });

    expect(result).toBe(false);
  });

  it('returns false when the HTTP call itself fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false));
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    const result = await adapter.verify({ token: 'abc' });

    expect(result).toBe(false);
  });

  it.each([
    ['a body that is not an object', 'ok'],
    ['nothing at all', null],
    ['a success that is not a boolean', { success: 'true' }],
    ['a different shape', { verified: true }],
  ])('refuses %s, whatever it might have meant', async (_name, body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
    const adapter = new TurnstileCaptchaAdapter({ secretKey: 'secret' });

    expect(await adapter.verify({ token: 'abc' })).toBe(false);
  });
});
