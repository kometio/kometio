import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  describe('what it is for', () => {
    it('keeps a link inside a sentence — the thing Kometio could not express at all', () => {
      expect(
        sanitizeRichText('<p>come ho <a href="/it/guida">spiegato qui</a></p>'),
      ).toBe('<p>come ho <a href="/it/guida">spiegato qui</a></p>');
    });

    it('keeps emphasis and lists', () => {
      const html = '<p><strong>a</strong> <em>b</em></p><ul><li>c</li></ul>';
      expect(sanitizeRichText(html)).toBe(html);
    });

    it('keeps an internal page reference, which render resolves later', () => {
      expect(sanitizeRichText('<a href="kometio://page/9f3a">x</a>')).toContain(
        'href="kometio://page/9f3a"',
      );
    });
  });

  describe('what it must not let through', () => {
    it('drops a script and its contents, not just the tag', () => {
      const out = sanitizeRichText('<p>ok</p><script>alert(1)</script>');
      expect(out).toBe('<p>ok</p>');
      expect(out).not.toContain('alert');
    });

    it('drops an event handler while keeping the element', () => {
      expect(sanitizeRichText('<p onclick="steal()">ciao</p>')).toBe(
        '<p>ciao</p>',
      );
    });

    it('drops a javascript: href, keeping the text', () => {
      const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
      expect(out).not.toContain('javascript');
      expect(out).toContain('x');
    });

    it('drops a protocol-relative href, which a scheme allowlist alone would miss', () => {
      // `//evil.example` has no scheme at all: the browser resolves it
      // against the page's own protocol and leaves the site.
      const out = sanitizeRichText('<a href="//evil.example/x">x</a>');
      expect(out).not.toContain('evil.example');
    });

    it('drops style and class, so a paragraph cannot escape the theme', () => {
      expect(
        sanitizeRichText('<p style="position:fixed" class="x">a</p>'),
      ).toBe('<p>a</p>');
    });

    it('drops img and iframe — those are blocks, with their own descriptors', () => {
      const out = sanitizeRichText(
        '<p>a</p><img src="x.png"><iframe src="https://e.example"></iframe>',
      );
      expect(out).toBe('<p>a</p>');
    });

    it('drops a heading, keeping its words', () => {
      expect(sanitizeRichText('<h1>Titolo</h1>')).toBe('Titolo');
    });
  });

  describe('target="_blank"', () => {
    it('forces rel=noopener, so the opened page cannot navigate this one', () => {
      const out = sanitizeRichText(
        '<a href="https://e.example" target="_blank">x</a>',
      );
      expect(out).toContain('rel="noopener"');
    });

    it('keeps a rel the author already set alongside it, without duplicating', () => {
      const out = sanitizeRichText(
        '<a href="https://e.example" target="_blank" rel="nofollow noopener">x</a>',
      );
      expect(out).toContain('nofollow');
      expect(out.match(/noopener/g)).toHaveLength(1);
    });

    it('adds nothing when the link opens in place', () => {
      expect(sanitizeRichText('<a href="/it/x">y</a>')).not.toContain('rel=');
    });
  });

  it('is idempotent — the migration script depends on running twice being safe', () => {
    const once = sanitizeRichText(
      '<p>a <a href="/x" target="_blank">b</a></p>',
    );
    expect(sanitizeRichText(once)).toBe(once);
  });

  it('leaves the empty value empty, so "is this field filled in" keeps working', () => {
    expect(sanitizeRichText('')).toBe('');
  });
});
