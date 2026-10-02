import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrevoNewsletterAdapter } from './brevo-newsletter.adapter';

function jsonResponse(ok: boolean) {
  return { ok } as Response;
}

describe('BrevoNewsletterAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the email and list id with updateEnabled so a repeat signup is idempotent', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true));
    const adapter = new BrevoNewsletterAdapter({ apiKey: 'secret', listId: 7 });

    await adapter.subscribe('visitor@example.com');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/contacts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'secret' }),
        body: JSON.stringify({
          email: 'visitor@example.com',
          listIds: [7],
          updateEnabled: true,
        }),
      }),
    );
  });

  it('throws when Brevo rejects the request', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(false));
    const adapter = new BrevoNewsletterAdapter({ apiKey: 'secret', listId: 7 });

    await expect(adapter.subscribe('visitor@example.com')).rejects.toThrow();
  });
});
