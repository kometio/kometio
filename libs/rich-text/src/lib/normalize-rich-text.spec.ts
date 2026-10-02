import { describe, expect, it } from 'vitest';
import { normalizeRichText } from './normalize-rich-text';
import { ALLOWED_TAGS } from './sanitize-rich-text';

describe('normalizeRichText', () => {
  describe('a plain string written before rich text existed', () => {
    it('becomes a paragraph', () => {
      expect(normalizeRichText('Ciao mondo')).toBe('<p>Ciao mondo</p>');
    });

    // The reason this function exists on the READ path and not only in a
    // migration script: unescaped, `set:html` eats this.
    it('escapes what would otherwise be read as markup', () => {
      expect(normalizeRichText('Rossi & Figli')).toBe(
        '<p>Rossi &amp; Figli</p>',
      );
      expect(normalizeRichText('Costa < 10 euro')).toBe(
        '<p>Costa &lt; 10 euro</p>',
      );
    });

    it('makes a blank line a new paragraph', () => {
      expect(normalizeRichText('Primo\n\nSecondo')).toBe(
        '<p>Primo</p><p>Secondo</p>',
      );
    });

    it('makes a single newline a line break, not a lost one', () => {
      expect(normalizeRichText('Via Roma 1\nMilano')).toBe(
        '<p>Via Roma 1<br />Milano</p>',
      );
    });
  });

  describe('rich text that does not begin with a tag', () => {
    // The bug this replaced: the test used to be `startsWith('<')`, so a
    // paragraph opening with a word had its markup escaped and the reader
    // saw the tags. 246 of the 548 rich text values on this project's own
    // documentation site were in that state.
    it('is markup, not text to be escaped', () => {
      expect(
        normalizeRichText(
          'Reach for this when <code>classic</code> is not enough',
        ),
      ).toBe('Reach for this when <code>classic</code> is not enough');
    });

    it('keeps a link written mid-sentence', () => {
      const value = 'Open <a href="/en/docs">the docs</a> and read on';
      expect(normalizeRichText(value)).toBe(value);
    });

    it('repairs markup an importer left unclosed', () => {
      expect(normalizeRichText('<p>unclosed')).toBe('<p>unclosed</p>');
    });

    it('still escapes a lone angle bracket, which is not a tag', () => {
      expect(normalizeRichText('Costa < 10 euro')).toBe(
        '<p>Costa &lt; 10 euro</p>',
      );
      expect(normalizeRichText('if x<y then z')).toBe(
        '<p>if x&lt;y then z</p>',
      );
    });

    it('never disagrees with the sanitiser about what a tag is', () => {
      for (const tag of ALLOWED_TAGS) {
        const value = `before <${tag}>x</${tag}> after`;
        expect(normalizeRichText(value), tag).not.toContain('&lt;');
      }
    });
  });

  describe('a value that is already rich text', () => {
    it('is left as it is', () => {
      const html = '<p>ciao <strong>mondo</strong></p>';
      expect(normalizeRichText(html)).toBe(html);
    });

    it('is still sanitised', () => {
      expect(normalizeRichText('<p>ok</p><script>steal()</script>')).toBe(
        '<p>ok</p>',
      );
    });

    it('keeps an internal page reference for render to resolve', () => {
      expect(
        normalizeRichText('<p><a href="kometio://page/9f3a">x</a></p>'),
      ).toContain('kometio://page/9f3a');
    });
  });

  // Load-bearing: the same function runs on write, on read AND in the
  // migration script. If a second pass changed anything, a value would
  // drift a little further every time it was saved.
  it('is idempotent', () => {
    for (const input of [
      'Rossi & Figli',
      'Primo\n\nSecondo',
      '<p>ciao <em>mondo</em></p>',
      'Via Roma 1\nMilano',
      'Reach for this when <code>classic</code> is not enough',
      '<p>unclosed',
      '',
    ]) {
      const once = normalizeRichText(input);
      expect(normalizeRichText(once), input).toBe(once);
    }
  });

  it('leaves an empty value empty, so "is this filled in" keeps working', () => {
    expect(normalizeRichText('')).toBe('');
    expect(normalizeRichText('   ')).toBe('');
  });
});
