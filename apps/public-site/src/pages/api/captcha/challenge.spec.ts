import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './challenge';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

async function ask(): Promise<Response> {
  // @ts-expect-error deliberately partial APIContext
  return GET({});
}

describe('GET /api/captcha/challenge', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the visitor's browser the challenge the API made, never from a cache", async () => {
    const challenge = { parameters: { nonce: 'n' }, signature: 's' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(challenge));

    const res = await ask();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual(challenge);
  });

  it.each([404, 429])(
    'passes on the API’s %s: it means something to the widget',
    async (status) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, status));

      expect((await ask()).status).toBe(status);
    },
  );

  it('answers 502 when the API fails some other way: this site could not get one', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    expect((await ask()).status).toBe(502);
  });
});
