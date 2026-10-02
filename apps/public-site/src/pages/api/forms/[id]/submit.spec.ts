import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './submit';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function formDataRequest(fields: Record<string, string>): Request {
  return new Request('http://localhost:4321/api/forms/form-1/submit', {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
}

function multipartRequest(
  fields: Record<string, string>,
  files: Record<string, File> = {},
): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }
  for (const [key, file] of Object.entries(files)) {
    body.append(key, file);
  }
  return new Request('http://localhost:4321/api/forms/form-1/submit', {
    method: 'POST',
    body,
  });
}

function redirect(path: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: path } });
}

describe('POST /api/forms/[id]/submit', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards field values and redirects with formSubmitted on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const request = formDataRequest({
      _redirectTo: '/contatti',
      _checkboxFields: 'consenso',
      _honeypot: '',
      email: 'visitor@example.com',
      consenso: 'on',
    });

    // @ts-expect-error deliberately partial APIContext — only params/request/redirect are used by this route.
    const res = await POST({ params: { id: 'form-1' }, request, redirect });

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/contatti?formSubmitted=form-1');

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(init?.body as string)).toEqual({
      pageId: null,
      values: { email: 'visitor@example.com', consenso: true },
      honeypot: '',
      captchaToken: '',
    });
  });

  it('forwards the page the form was rendered on, and never as an answer', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const request = formDataRequest({
      _redirectTo: '/contatti',
      _checkboxFields: '',
      _honeypot: '',
      _pageId: 'translation-1',
      email: 'visitor@example.com',
    });

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string);
    expect(body.pageId).toBe('translation-1');
    // `_`-prefixed like every other hint field, so it stays out of what
    // the visitor is recorded as having typed.
    expect(body.values).not.toHaveProperty('_pageId');
  });

  it("forwards Turnstile's injected cf-turnstile-response as the captcha token", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const request = formDataRequest({
      _redirectTo: '/contatti',
      _checkboxFields: '',
      _honeypot: '',
      email: 'visitor@example.com',
      'cf-turnstile-response': 'widget-token',
    });

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string);
    expect(body.captchaToken).toBe('widget-token');
    // Must not leak into the form's own field values.
    expect(body.values).not.toHaveProperty('cf-turnstile-response');
  });

  it('marks an unchecked checkbox as false even though the browser never submits its key', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const request = formDataRequest({
      _redirectTo: '/contatti',
      _checkboxFields: 'consenso',
      _honeypot: '',
      email: 'visitor@example.com',
      // consenso deliberately absent — a native unchecked checkbox never submits a key.
    });

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(init?.body as string).values.consenso).toBe(false);
  });

  it('uploads a selected file first, then sends its {url, filename} in the values', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
          filename: 'cv.pdf',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(undefined, 204));

    const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
    const request = multipartRequest(
      { _redirectTo: '/contatti', _checkboxFields: '', _honeypot: '' },
      { cv: file },
    );

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain(
      '/public/forms/form-1/attachments',
    );
    const [, submitInit] = vi.mocked(fetch).mock.calls[1] ?? [];
    const body = JSON.parse(submitInit?.body as string);
    expect(body.values.cv).toEqual({
      url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
      filename: 'cv.pdf',
    });
  });

  it('does not attempt an upload when no file was selected', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    // A real <input type="file"> with nothing selected submits its field
    // as an empty string, not a File (WHATWG spec) — even an explicitly
    // constructed empty-name File round-trips through FormData/fetch the
    // same way, confirmed by this test.
    const emptyFile = new File([], '');
    const request = multipartRequest(
      { _redirectTo: '/contatti', _checkboxFields: '', _honeypot: '' },
      { cv: emptyFile },
    );

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    // Not a { url, filename } object — submitForm's own isBlank() already
    // treats '' as missing, same as any other untouched optional field.
    expect(JSON.parse(init?.body as string).values.cv).toBe('');
  });

  it('never uploads a file for a honeypot-filled submission', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
    const request = multipartRequest(
      {
        _redirectTo: '/contatti',
        _checkboxFields: '',
        _honeypot: 'i-am-a-bot',
      },
      { cv: file },
    );

    // @ts-expect-error deliberately partial APIContext
    await POST({ params: { id: 'form-1' }, request, redirect });

    // Only the final (silently-accepted) submission call, never an upload.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/submissions');
  });

  it('redirects with formError when the API rejects the submission', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Missing required field' }, 400),
    );

    const request = formDataRequest({
      _redirectTo: '/contatti',
      _checkboxFields: '',
      _honeypot: '',
    });

    // @ts-expect-error deliberately partial APIContext
    const res = await POST({ params: { id: 'form-1' }, request, redirect });

    expect(res.headers.get('Location')).toBe('/contatti?formError=form-1');
  });

  it('404s when the id param is missing', async () => {
    const request = formDataRequest({});

    // @ts-expect-error deliberately partial APIContext
    const res = await POST({ params: {}, request, redirect });

    expect(res.status).toBe(404);
  });
});
