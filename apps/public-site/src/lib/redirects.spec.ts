import { describe, expect, it, vi } from 'vitest';
import {
  hasOnlyTrackingParams,
  isAskedForRedirect,
  redirectForMissing,
  responseForRedirect,
} from './redirects';

describe('isAskedForRedirect', () => {
  it('asks for a page address, a file that was linked, and a front door', () => {
    expect(isAskedForRedirect('GET', '/2019/05/old')).toBe(true);
    expect(isAskedForRedirect('HEAD', '/en/old')).toBe(true);
    expect(isAskedForRedirect('GET', '/wp-content/uploads/a.jpg')).toBe(true);
  });

  it('does not ask for what the site answers itself, or for a write', () => {
    for (const path of [
      '/_astro/chunk.js',
      '/_image',
      '/api/forms/1/submit',
      '/preview/abc',
    ]) {
      expect(isAskedForRedirect('GET', path)).toBe(false);
    }
    expect(isAskedForRedirect('POST', '/old')).toBe(false);
  });
});

describe('hasOnlyTrackingParams', () => {
  it('says a campaign’s tags are not a question', () => {
    expect(hasOnlyTrackingParams('?utm_source=mail&utm_medium=x')).toBe(true);
    expect(hasOnlyTrackingParams('?fbclid=abc&gclid=1')).toBe(true);
  });

  it('says a number is', () => {
    expect(hasOnlyTrackingParams('?p=123')).toBe(false);
    expect(hasOnlyTrackingParams('?utm_source=mail&p=123')).toBe(false);
    expect(hasOnlyTrackingParams('?page_id=4')).toBe(false);
  });
});

describe('responseForRedirect', () => {
  it('is a redirect with where to, kept for minutes and not for ever', () => {
    const response = responseForRedirect({
      outcome: 'redirect',
      status: 301,
      location: '/en/new',
    });

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/en/new');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('is not kept at all when it is temporary', () => {
    const response = responseForRedirect({
      outcome: 'redirect',
      status: 302,
      location: '/en/new',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('says gone with the page that would have been sent, as it was', async () => {
    const notFound = new Response('<h1>Not here</h1>', {
      status: 404,
      headers: { 'Content-Type': 'text/html', 'X-Thing': '1' },
    });

    const response = responseForRedirect({ outcome: 'gone' }, notFound);

    expect(response.status).toBe(410);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('X-Thing')).toBe('1');
    expect(await response.text()).toBe('<h1>Not here</h1>');
  });
});

describe('redirectForMissing', () => {
  const url = new URL('https://example.com/2019/05/old?utm_source=mail');

  it('asks the API for the host, the path and the query as they came', async () => {
    const ask = vi.fn().mockResolvedValue({ outcome: 'gone' });

    const answer = await redirectForMissing(url, { ask, report: vi.fn() });

    expect(answer).toEqual({ outcome: 'gone' });
    expect(ask).toHaveBeenCalledWith(
      'example.com',
      '/2019/05/old',
      '?utm_source=mail',
    );
  });

  it('is no answer, and is reported, when the API could not be asked', async () => {
    const report = vi.fn();
    const error = new Error('api away');

    const answer = await redirectForMissing(url, {
      ask: vi.fn().mockRejectedValue(error),
      report,
    });

    expect(answer).toBeNull();
    expect(report).toHaveBeenCalledWith(error);
  });
});
