import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, request, ServerUnreachableError } from './http-client';

describe('a request that gets no answer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a ServerUnreachableError naming the address that was asked', async () => {
    // What a browser rejects with for a server that is down and for a page
    // the server's CORS rule does not know: the same TypeError, either way.
    const refused = new TypeError('Failed to fetch');
    vi.mocked(fetch).mockRejectedValue(refused);

    const error = await request('/sites/current').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerUnreachableError);
    expect(error).toMatchObject({
      apiBaseUrl: API_BASE_URL,
      cause: refused,
    });
  });

  it('is not what a timeout is: a slow server is not an absent one', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation was aborted.', 'TimeoutError'),
    );

    const error = await request('/slow').catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ServerUnreachableError);
    expect(error).toMatchObject({
      message: expect.stringMatching(/timed out/i),
    });
  });
});
