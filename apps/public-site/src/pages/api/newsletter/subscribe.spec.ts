import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './subscribe';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function formDataRequest(fields: Record<string, string>): Request {
  return new Request('http://localhost:4321/api/newsletter/subscribe', {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
}

function redirect(path: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: path } });
}

describe('POST /api/newsletter/subscribe', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the email and redirects with newsletterSubscribed on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const request = formDataRequest({
      _redirectTo: '/',
      _honeypot: '',
      email: 'visitor@example.com',
      'cf-turnstile-response': 'widget-token',
    });

    // @ts-expect-error deliberately partial APIContext
    const res = await POST({ request, redirect });

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/?newsletterSubscribed=1');

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'visitor@example.com',
      honeypot: '',
      captchaToken: 'widget-token',
    });
  });

  it('redirects with newsletterError when the API rejects the subscription', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Invalid email' }, 400),
    );

    const request = formDataRequest({
      _redirectTo: '/',
      _honeypot: '',
      email: 'not-an-email',
    });

    // @ts-expect-error deliberately partial APIContext
    const res = await POST({ request, redirect });

    expect(res.headers.get('Location')).toBe('/?newsletterError=1');
  });
});
