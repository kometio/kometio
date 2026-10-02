export interface FeedItem {
  title: string;
  /** Absolute, because a feed is read somewhere else entirely. */
  link: string;
  description: string;
  /** ISO, or `null` for a page with no publication date — such an item carries none rather than today's. */
  publishedAt: string | null;
}

export interface RssFeedInput {
  title: string;
  /** Where the feed itself answers, which RSS wants stated inside it (`atom:link`). */
  feedUrl: string;
  /** The page a reader lands on from the feed's own title. */
  siteUrl: string;
  language: string;
  items: FeedItem[];
}

/**
 * Text that is safe inside an XML element or attribute.
 *
 * A title with an `&` in it is not an exotic case — "Tom & Jerry" is a
 * headline — and an unescaped one makes the whole feed unparseable, which
 * every reader reports as "this feed is broken" rather than as one bad
 * item.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RFC 822, which is the date format RSS 2.0 actually specifies. */
function rfc822(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toUTCString();
}

/**
 * One RSS 2.0 document.
 *
 * Its own function, and pure, so the format is pinned by tests rather
 * than by opening a reader and squinting: a feed is read by software, and
 * software is unforgiving about exactly this kind of detail.
 */
export function buildRssFeed(input: RssFeedInput): string {
  const items = input.items
    .map((item) => {
      const date = item.publishedAt ? rfc822(item.publishedAt) : null;
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.link)}</link>`,
        // The link, because a page's address is the one thing about it
        // that does not change when it is edited.
        `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
        item.description
          ? `      <description>${escapeXml(item.description)}</description>`
          : null,
        date ? `      <pubDate>${date}</pubDate>` : null,
        '    </item>',
      ]
        .filter((line) => line !== null)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(input.title)}</title>
    <link>${escapeXml(input.siteUrl)}</link>
    <description>${escapeXml(input.title)}</description>
    <language>${escapeXml(input.language)}</language>
    <atom:link href="${escapeXml(input.feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
