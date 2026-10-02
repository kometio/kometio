import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailchimpNewsletterAdapter } from './mailchimp-newsletter.adapter';

function jsonResponse(ok: boolean) {
  return { ok } as Response;
}

describe('MailchimpNewsletterAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs to the data-center-scoped URL keyed by the MD5 of the lowercased email', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true));
    const adapter = new MailchimpNewsletterAdapter({
      apiKey: 'abc123-us21',
      audienceId: 'audience-1',
    });

    await adapter.subscribe('Visitor@Example.com');

    const expectedHash = createHash('md5')
      .update('visitor@example.com')
      .digest('hex');
    expect(fetch).toHaveBeenCalledWith(
      `https://us21.api.mailchimp.com/3.0/lists/audience-1/members/${expectedHash}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          email_address: 'Visitor@Example.com',
          status_if_new: 'subscribed',
          status: 'subscribed',
        }),
      }),
    );
  });

  it('sends HTTP Basic auth built from the API key', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true));
    const adapter = new MailchimpNewsletterAdapter({
      apiKey: 'abc123-us21',
      audienceId: 'audience-1',
    });

    await adapter.subscribe('visitor@example.com');

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(
      `Basic ${Buffer.from('anystring:abc123-us21').toString('base64')}`,
    );
  });

  it('throws when Mailchimp rejects the request', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(false));
    const adapter = new MailchimpNewsletterAdapter({
      apiKey: 'abc123-us21',
      audienceId: 'audience-1',
    });

    await expect(adapter.subscribe('visitor@example.com')).rejects.toThrow();
  });

  it('throws if the API key is empty (no data center suffix to extract)', async () => {
    const adapter = new MailchimpNewsletterAdapter({
      apiKey: '',
      audienceId: 'audience-1',
    });

    await expect(adapter.subscribe('visitor@example.com')).rejects.toThrow(
      'Invalid Mailchimp API key',
    );
  });
});
