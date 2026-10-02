import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBlockFragment } from './block-fragment-api-client';
import { PUBLIC_SITE_URL } from './public-site-url';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('renderBlockFragment', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to apps/public-site's own render-block-fragment route and returns the html", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ html: '<div>x</div>' }));

    const html = await renderBlockFragment({
      pageId: 'page-1',
      token: 'tok',
      blockId: 'hero-1',
      blockType: 'Hero',
      props: { title: 'New' },
    });

    expect(fetch).toHaveBeenCalledWith(
      `${PUBLIC_SITE_URL}/api/render-block-fragment`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          pageId: 'page-1',
          token: 'tok',
          blockId: 'hero-1',
          blockType: 'Hero',
          props: { title: 'New' },
        }),
      }),
    );
    expect(html).toBe('<div>x</div>');
  });

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(null, 404));

    await expect(
      renderBlockFragment({
        pageId: 'page-1',
        token: 'bad',
        blockId: 'hero-1',
        blockType: 'Hero',
        props: {},
      }),
    ).rejects.toThrow('404');
  });
});
