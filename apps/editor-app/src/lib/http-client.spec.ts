import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@kometio/testing/fetch-response';
import { ApiError, applyApiFieldErrors, request } from './http-client';

describe('http-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed JSON body on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ hello: 'world' }));

    const result = await request('/anything');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/anything'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual({ hello: 'world' });
  });

  it('throws an ApiError carrying the status and the parsed error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Not found' }, 404),
    );

    await expect(request('/missing')).rejects.toThrow(/API 404.*Not found/);
    const error = await request('/missing').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });

  it('throws even when the error body cannot be parsed as JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>not json</html>', { status: 500 }),
    );

    await expect(request('/broken')).rejects.toThrow(/API 500/);
  });

  it('resolves with undefined for a 204 No Content response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(request('/pages/page-1')).resolves.toBeUndefined();
  });

  it('does not set Content-Type: application/json for a FormData body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    const body = new FormData();
    body.append('file', new File(['data'], 'a.png'));

    await request('/media', { method: 'POST', body });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
  });

  it('passes an AbortSignal, so a hung backend eventually rejects instead of leaving the caller stuck forever', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));

    await request('/anything');

    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  // Security review 2026-08-24, point 18: this is the exact failure mode
  // that motivated the fix — simulates what the browser produces when
  // AbortSignal.timeout() actually fires on a hung request.
  it('throws a clear timeout error instead of a raw AbortError when the request times out', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation was aborted.', 'TimeoutError'),
    );

    await expect(request('/slow')).rejects.toThrow(/timed out/i);
  });

  it('lets a non-timeout fetch failure (e.g. offline) propagate unchanged', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(request('/anything')).rejects.toThrow('Failed to fetch');
  });
});

describe('applyApiFieldErrors', () => {
  const values = { name: '', domain: '' };

  function zodBody(fieldErrors: Record<string, string[]>) {
    return { formErrors: [], fieldErrors };
  }

  it('puts each message under its own field, and says it did', () => {
    const setError = vi.fn();

    const assigned = applyApiFieldErrors(
      new ApiError(400, zodBody({ domain: ['Invalid hostname'] })),
      setError,
      values,
    );

    expect(assigned).toBe(true);
    expect(setError).toHaveBeenCalledWith('domain', {
      type: 'server',
      message: 'Invalid hostname',
    });
  });

  it('takes the first message of a field, and every field that has one', () => {
    const setError = vi.fn();

    applyApiFieldErrors(
      new ApiError(
        400,
        zodBody({ name: ['Too short', 'Not allowed'], domain: ['Invalid'] }),
      ),
      setError,
      values,
    );

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith('name', {
      type: 'server',
      message: 'Too short',
    });
  });

  it('uses an alias for a field the form calls something else', () => {
    const setError = vi.fn();

    const assigned = applyApiFieldErrors(
      new ApiError(400, zodBody({ businessPhone: ['Invalid phone'] })),
      setError,
      { phone: '' },
      { businessPhone: 'phone' },
    );

    expect(assigned).toBe(true);
    expect(setError).toHaveBeenCalledWith('phone', {
      type: 'server',
      message: 'Invalid phone',
    });
  });

  it('says it put nothing anywhere for a field the form does not have', () => {
    const setError = vi.fn();

    expect(
      applyApiFieldErrors(
        new ApiError(400, zodBody({ somethingElse: ['Invalid'] })),
        setError,
        values,
      ),
    ).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it.each([
    ['another status', new ApiError(500, zodBody({ domain: ['Invalid'] }))],
    ['a body of another shape', new ApiError(400, { message: 'No' })],
    ['a body with no fields', new ApiError(400, zodBody({}))],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('leaves it to the caller for %s', (_name, error) => {
    const setError = vi.fn();

    expect(applyApiFieldErrors(error, setError, values)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
