import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@kometio/testing/fetch-response';
import { BrevoNewsletterAdapter } from './brevo-newsletter.adapter';

describe('BrevoNewsletterAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the email and list id with updateEnabled so a repeat signup is idempotent', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
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
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 400));
    const adapter = new BrevoNewsletterAdapter({ apiKey: 'secret', listId: 7 });

    await expect(adapter.subscribe('visitor@example.com')).rejects.toThrow();
  });
});
