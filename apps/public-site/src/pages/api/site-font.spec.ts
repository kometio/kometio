import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './site-font';

const MEDIA = 'https://api.example.test/api/uploads/';
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]); // "wOF2"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function ask(href: string | null): Promise<Response> {
  const url = new URL('https://site.example.test/api/site-font');
  if (href !== null) url.searchParams.set('href', href);
  // @ts-expect-error deliberately partial APIContext
  return GET({ url });
}

describe('GET /api/site-font', () => {
  beforeEach(() => {
    vi.stubEnv('API_PUBLIC_URL', 'https://api.example.test/api');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('serves a font of the site’s own library, from the site’s address, for a year', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(WOFF2));

    const res = await ask(`${MEDIA}a.woff2`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('font/woff2');
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WOFF2);
    expect(fetch).toHaveBeenCalledWith(
      `${MEDIA}a.woff2`,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it.each([
    ['another server', 'https://elsewhere.example.test/a.woff2'],
    ['the inside of the network', 'http://169.254.169.254/latest/meta-data'],
    ['a path out of the library', `${MEDIA}../secrets.woff2`],
    ['nothing at all', null],
  ])('fetches nothing from %s', async (_what, href) => {
    expect((await ask(href)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a file of the library that is not a web font, whatever it is called', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(PNG));

    expect((await ask(`${MEDIA}a.woff2`)).status).toBe(415);
  });

  it('says the file is not there when the library says so', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));

    expect((await ask(`${MEDIA}a.woff2`)).status).toBe(404);
  });

  it('refuses a file bigger than any font the library accepts', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(WOFF2, {
        headers: { 'content-length': String(11 * 1024 * 1024) },
      }),
    );

    expect((await ask(`${MEDIA}a.woff2`)).status).toBe(413);
  });

  it('answers 502 when the library cannot be reached, or redirects', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    expect((await ask(`${MEDIA}a.woff2`)).status).toBe(502);
  });
});
