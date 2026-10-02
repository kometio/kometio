import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { type PublishedPage } from '@kometio/api-contracts';
import type { PublishedSiteChromeDto } from './public-api-client';
import {
  getPublicForm,
  getPublishedAuthorBySlug,
  getPublishedPageBySlug,
  getPublishedSiteChrome,
  listPublishedPagesForSitemap,
  listPublishedPageTree,
  subscribeNewsletter,
  submitPublicForm,
  uploadFormAttachment,
} from './public-api-client';

const samplePage: PublishedPage = {
  id: 'translation-1',
  content: [{ type: 'Hero', props: { title: 'Ciao', subtitle: 'Sub' } }],
  seoMeta: { title: 'Chi siamo', description: 'La nostra storia' },
  locale: 'it',
  translations: [{ locale: 'it', slug: 'chi-siamo', ancestorSlugs: [] }],
  ancestors: [],
  site: {
    name: 'Sito di prova',
    domain: 'example.com',
    themeName: 'classic',
    defaultLocale: 'it',
    enabledLocales: ['it'],
    untranslatedPageFallback: 'redirect-to-default',
    businessAddress: null,
    businessPhone: null,
    businessEmail: null,
    businessType: null,
    openingHours: null,
    searchEngineIndexingEnabled: false,
    themeSettings: {
      primaryColor: null,
      secondaryColor: null,
      fontFamily: null,
      customCss: null,
      contentWidth: null,
      headScript: null,
      bodyScript: null,
      faviconUrl: null,
      overridesEnabled: true,
      allowedTrackerDomains: [],
      trackerScripts: [],
    },
    themeTokens: {
      blockStyles: {},
    },
    cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
    privacyPolicySlug: null,
    cookiePolicySlug: null,
  },
  header: null,
  footer: null,
  headerSticky: false,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('public-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the published page by domain, locale, and path', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(samplePage));

    const result = await getPublishedPageBySlug('example.com', 'it', [
      'chi-siamo',
    ]);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/public/pages/by-slug?domain=example.com&locale=it&path=chi-siamo',
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result).toEqual({ found: true, page: samplePage });
  });

  it('fetches the published page by a multi-segment path', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(samplePage));

    await getPublishedPageBySlug('example.com', 'it', ['servizi', 'idraulica']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/public/pages/by-slug?domain=example.com&locale=it&path=servizi%2Fidraulica',
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('returns found: false with no fallback on a plain 404 instead of throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Not Found' }, 404),
    );

    const result = await getPublishedPageBySlug('example.com', 'it', [
      'non-esiste',
    ]);

    expect(result).toEqual({ found: false, fallback: null, movedTo: null });
  });

  it('surfaces the fallback locale/path from a 404 body when the site redirects untranslated pages', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { fallback: { locale: 'it', segments: ['chi-siamo'] } },
        404,
      ),
    );

    const result = await getPublishedPageBySlug('example.com', 'en', [
      'chi-siamo',
    ]);

    expect(result).toEqual({
      found: false,
      fallback: { locale: 'it', segments: ['chi-siamo'] },
      movedTo: null,
    });
  });

  /*
   * A different answer from `fallback`, and the route treats it
   * differently: a term claimed this page, so the content lives at the
   * term's address and the redirect is permanent (docs/adr/0067).
   */
  it('surfaces a permanent move from a 404 body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ fallback: null, movedTo: '/it/categoria/espresso' }, 404),
    );

    const result = await getPublishedPageBySlug('example.com', 'it', [
      'chi-siamo',
    ]);

    expect(result).toEqual({
      found: false,
      fallback: null,
      movedTo: '/it/categoria/espresso',
    });
  });

  it('throws on any other non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(
      getPublishedPageBySlug('example.com', 'it', ['chi-siamo']),
    ).rejects.toThrow('Public pages API error: 500');
  });

  describe('an author page', () => {
    const sampleAuthor = {
      ...samplePage,
      author: {
        id: 'u1',
        name: 'Giulia Rossi',
        bio: '',
        avatar: null,
        path: '/it/autore/giulia-rossi',
      },
    };

    it("fetches it by domain, locale and the person's address", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleAuthor));

      const result = await getPublishedAuthorBySlug(
        'example.com',
        'it',
        'giulia-rossi',
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/public/pages/author-by-slug?domain=example.com&locale=it&slug=giulia-rossi',
        ),
        expect.objectContaining({ signal: expect.anything() }),
      );
      expect(result).toEqual({ found: true, author: sampleAuthor });
    });

    it('surfaces where a person moved their page, and nothing for no page', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ fallback: null, movedTo: '/it/autore/giulia' }, 404),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ message: 'Author not found' }, 404),
      );

      expect(
        await getPublishedAuthorBySlug('example.com', 'it', 'giulia-rossi'),
      ).toEqual({ found: false, movedTo: '/it/autore/giulia' });
      expect(
        await getPublishedAuthorBySlug('example.com', 'it', 'nessuno'),
      ).toEqual({ found: false, movedTo: null });
    });

    it('throws on any other non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

      await expect(
        getPublishedAuthorBySlug('example.com', 'it', 'giulia-rossi'),
      ).rejects.toThrow('Public authors API error: 500');
    });
  });

  it('fetches the site chrome by domain and locale, with no slug in the picture', async () => {
    const chrome: PublishedSiteChromeDto = {
      site: samplePage.site,
      header: [{ type: 'Header', props: {} }],
      footer: null,
      headerSticky: false,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(chrome));

    const result = await getPublishedSiteChrome('example.com', 'it');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/public/pages/chrome?domain=example.com&locale=it',
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result).toEqual(chrome);
  });

  it('getPublishedSiteChrome returns null on a 404 instead of throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Not Found' }, 404),
    );

    const result = await getPublishedSiteChrome('nobody-has-this.test', 'it');

    expect(result).toBeNull();
  });

  it('getPublishedSiteChrome throws on any other non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(getPublishedSiteChrome('example.com', 'it')).rejects.toThrow(
      'Public pages API error: 500',
    );
  });

  it('fetches the flat page tree for a domain and locale', async () => {
    const items = [
      {
        id: 'page-1',
        parentId: null,
        slug: 'guide',
        title: 'Guide',
        ancestorSlugs: [],
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items }));

    const result = await listPublishedPageTree('example.com', 'it');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/public/pages/tree?domain=example.com&locale=it',
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result).toEqual(items);
  });

  it('listPublishedPageTree throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(listPublishedPageTree('example.com', 'it')).rejects.toThrow(
      'Public pages API error: 500',
    );
  });

  it('fetches the sitemap listing, bundled with the indexing flag, for a domain', async () => {
    const items = [
      {
        slug: 'chi-siamo',
        locale: 'it',
        groupId: 'group-1',
        ancestorSlugs: [],
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        items,
        searchEngineIndexingEnabled: true,
        defaultLocale: 'it',
      }),
    );

    const result = await listPublishedPagesForSitemap('example.com');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/pages?domain=example.com'),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result).toEqual({
      items,
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });
  });

  it('throws when the sitemap request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(listPublishedPagesForSitemap('example.com')).rejects.toThrow(
      'Public pages API error: 500',
    );
  });

  it('fetches a public form by id', async () => {
    const form = { id: 'form-1', name: 'Contatti', fields: [], steps: [] };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(form));

    const result = await getPublicForm('form-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/forms/form-1'),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result).toEqual(form);
  });

  it('refuses a form the API sent in a shape the Form block cannot draw', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: 'form-1', name: 'Contatti', fields: 'none' }),
    );

    await expect(getPublicForm('form-1')).rejects.toThrow();
  });

  it('getPublicForm returns null when the form does not exist', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Not Found' }, 404),
    );

    const result = await getPublicForm('does-not-exist');

    expect(result).toBeNull();
  });

  it('submitPublicForm posts the submission and reports success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const result = await submitPublicForm('form-1', {
      pageId: null,
      values: { email: 'visitor@example.com' },
      honeypot: '',
      captchaToken: 'test-token',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/forms/form-1/submissions'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('uploadFormAttachment posts the file as multipart and returns the stored url/filename', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
        filename: 'cv.pdf',
      }),
    );
    const file = new File(['%PDF-1.4'], 'cv.pdf', {
      type: 'application/pdf',
    });

    const result = await uploadFormAttachment('form-1', file);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/forms/form-1/attachments'),
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(result).toEqual({
      url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
      filename: 'cv.pdf',
    });
  });

  it('uploadFormAttachment throws on a failed upload', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 400));
    const file = new File(['x'], 'x.txt', { type: 'text/plain' });

    await expect(uploadFormAttachment('form-1', file)).rejects.toThrow();
  });

  it('submitPublicForm reports failure with the status code, without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Missing required field' }, 400),
    );

    const result = await submitPublicForm('form-1', {
      pageId: null,
      values: {},
      honeypot: '',
      captchaToken: 'test-token',
    });

    expect(result).toEqual({ ok: false, status: 400 });
  });

  it('subscribeNewsletter posts the email and reports success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(undefined, 204));

    const result = await subscribeNewsletter({
      email: 'visitor@example.com',
      honeypot: '',
      captchaToken: 'test-token',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/newsletter/subscribe'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('subscribeNewsletter reports failure with the status code, without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Invalid email' }, 400),
    );

    const result = await subscribeNewsletter({
      email: 'not-an-email',
      honeypot: '',
      captchaToken: 'test-token',
    });

    expect(result).toEqual({ ok: false, status: 400 });
  });

  // Security review 2026-08-24, point 18: simulates what AbortSignal.timeout()
  // produces when a hung apps/api never responds — a rejecting fetch, not a
  // hanging one, is what actually protects the SSR worker.
  it('throws a clear timeout error instead of a raw AbortError when the request times out', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation was aborted.', 'TimeoutError'),
    );

    await expect(
      getPublishedPageBySlug('example.com', 'it', ['chi-siamo']),
    ).rejects.toThrow(/timed out/i);
  });

  it('lets a non-timeout fetch failure propagate unchanged', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      getPublishedPageBySlug('example.com', 'it', ['chi-siamo']),
    ).rejects.toThrow('Failed to fetch');
  });

  it('refuses an answer that is not the shape it expects, instead of believing it', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [{ slug: 1 }], defaultLocale: 'it' }),
    );

    await expect(listPublishedPagesForSitemap('example.com')).rejects.toThrow();
  });
});
