import sanitizeHtml from 'sanitize-html';
import { KOMETIO_PAGE_LINK_SCHEME } from '@kometio/shared-types';

/**
 * What a rich text value is allowed to contain (ADR-0046): enough to write
 * a paragraph — emphasis, a list, and above all a link INSIDE a sentence,
 * which Kometio had no way to express at all — and nothing else.
 *
 * No `img`, `iframe`, `table`, `h1`-`h6`: those are BLOCKS in this
 * product, with their own descriptors, their own styling and their own
 * place in the Layers panel. Letting them in through a text field would
 * produce content the canvas cannot see or edit.
 */
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'del',
  'strike',
  'ul',
  'ol',
  'li',
  'code',
  'sub',
  'sup',
];

/**
 * Deliberately the OPPOSITE policy to the only other sanitiser in this
 * codebase. `EmbedHtml.astro` runs sanitize-html with `allowedTags: false,
 * allowedAttributes: false, allowVulnerableTags: true` — permissive on
 * purpose, because there the containment is a sandboxed iframe
 * (ADR-0025), not the allowlist.
 *
 * Here there is no iframe: this HTML is rendered straight into the page
 * with `set:html`, in the same document as the reader's session. The two
 * configurations must never be confused, and neither should be reused for
 * the other's job.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
  },
  // `kometio` carries an internal page reference that render swaps for a
  // real path (see KOMETIO_PAGE_LINK_SCHEME). It never reaches a browser.
  allowedSchemes: ['http', 'https', 'mailto', KOMETIO_PAGE_LINK_SCHEME],
  // `//evil.example` has no scheme, so a scheme allowlist alone does not
  // stop it: the browser would resolve it against the page's own protocol
  // and leave the site. Relative paths stay allowed, which is what an
  // internal link written by hand needs.
  allowProtocolRelative: false,
  transformTags: {
    // One canonical spelling for each meaning. `del`/`strike` and `b`/`i`
    // are not accepted for their own sake — nobody types HTML into this
    // field, the editor emits `s`/`strong`/`em` — but imported content
    // is full of them, and refusing them would silently flatten the
    // formatting of every emphasised word on a migrated blog. Accepting
    // and normalising keeps the meaning and still leaves one shape in
    // the database.
    del: 's',
    strike: 's',
    b: 'strong',
    i: 'em',
    a: (tagName, attribs) => {
      const next: Record<string, string> = { ...attribs };
      if (next['target'] === '_blank') {
        // Without it, the opened page gets a handle on this one through
        // `window.opener` and can navigate it somewhere else. Forced
        // rather than offered: the person writing a paragraph is not the
        // person who should have to know this.
        const rel = new Set((next['rel'] ?? '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        next['rel'] = [...rel].join(' ');
      }
      return { tagName, attribs: next };
    },
  },
};

/**
 * The one door into the database for rich text. Every write path in the
 * API runs it (there is a test that enumerates them and fails if one does
 * not), so rendering can trust what it reads and use `set:html`.
 *
 * The CSP nonce (ADR-0028) stays the second barrier, not the first.
 */
export function sanitizeRichText(value: string): string {
  return sanitizeHtml(value, OPTIONS);
}
