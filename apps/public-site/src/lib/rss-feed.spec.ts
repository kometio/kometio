import { describe, expect, it } from 'vitest';
import { buildRssFeed } from './rss-feed';

const base = {
  title: 'Kometio news',
  feedUrl: 'https://example.com/en/rss.xml',
  siteUrl: 'https://example.com/en',
  language: 'en',
};

describe('buildRssFeed', () => {
  it('writes one item per entry, with an absolute link used as its id', () => {
    const xml = buildRssFeed({
      ...base,
      items: [
        {
          title: 'First',
          link: 'https://example.com/en/first',
          description: 'A summary',
          publishedAt: '2026-09-12T10:00:00.000Z',
        },
      ],
    });

    expect(xml).toContain('<title>First</title>');
    expect(xml).toContain('<link>https://example.com/en/first</link>');
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/en/first</guid>',
    );
    expect(xml).toContain('<description>A summary</description>');
    expect(xml).toContain('<pubDate>Sat, 12 Sep 2026 10:00:00 GMT</pubDate>');
  });

  it('escapes text, because one ampersand in a headline breaks the whole feed', () => {
    const xml = buildRssFeed({
      ...base,
      items: [
        {
          title: 'Tom & Jerry <b>win</b>',
          link: 'https://example.com/en/t?a=1&b=2',
          description: 'He said "yes"',
          publishedAt: null,
        },
      ],
    });

    expect(xml).toContain(
      '<title>Tom &amp; Jerry &lt;b&gt;win&lt;/b&gt;</title>',
    );
    expect(xml).toContain('<link>https://example.com/en/t?a=1&amp;b=2</link>');
    expect(xml).toContain('He said &quot;yes&quot;');
  });

  it('leaves out the date of a page that has none rather than dating it today', () => {
    const xml = buildRssFeed({
      ...base,
      items: [
        {
          title: 'Undated',
          link: 'https://example.com/en/undated',
          description: '',
          publishedAt: null,
        },
      ],
    });

    expect(xml).not.toContain('<pubDate>');
    // And no empty description either: an element with nothing in it is
    // not the same as an honest absence.
    expect(xml).not.toContain('<description></description>');
  });

  it('says where it lives, which is what a reader subscribes to', () => {
    const xml = buildRssFeed({ ...base, items: [] });
    expect(xml).toContain(
      '<atom:link href="https://example.com/en/rss.xml" rel="self" type="application/rss+xml" />',
    );
  });
});
