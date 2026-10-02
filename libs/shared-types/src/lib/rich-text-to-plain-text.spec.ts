import { describe, expect, it } from 'vitest';
import { richTextToPlainText } from './rich-text-to-plain-text';

describe('richTextToPlainText', () => {
  it('returns the words without the markup', () => {
    expect(richTextToPlainText('<p>ciao <strong>mondo</strong></p>')).toBe(
      'ciao mondo',
    );
  });

  it('separates paragraphs, so the index does not fuse the last word to the next first', () => {
    // Without this, "primo" and "secondo" become "primosecondo" and
    // neither is findable.
    expect(richTextToPlainText('<p>primo</p><p>secondo</p>')).toBe(
      'primo secondo',
    );
  });

  it('separates list items and line breaks the same way', () => {
    expect(richTextToPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('a b');
    expect(richTextToPlainText('<p>a<br>b</p>')).toBe('a b');
  });

  // The values every one of these fields held before ADR-0046. Stripping
  // `<[^>]*>` from them would delete the middle of the sentence.
  it('leaves a plain string alone, angle brackets included', () => {
    expect(richTextToPlainText('Costa < 10 euro > 5')).toBe(
      'Costa < 10 euro > 5',
    );
    expect(richTextToPlainText('Rossi & Figli')).toBe('Rossi & Figli');
  });

  it('keeps the text of a link, dropping its address', () => {
    expect(richTextToPlainText('<a href="/it/x">leggi qui</a>')).toBe(
      'leggi qui',
    );
  });

  // These land in TEXT positions — a meta description, a search result.
  // "Rossi &amp; Figli" is what a reader would otherwise see.
  it('decodes entities rather than indexing them literally', () => {
    expect(richTextToPlainText('<p>Rossi &amp; Figli</p>')).toBe(
      'Rossi & Figli',
    );
    expect(richTextToPlainText('<p>a &quot;b&quot; c</p>')).toBe('a "b" c');
    expect(richTextToPlainText('<p>5 &#38; 6</p>')).toBe('5 & 6');
  });

  it('decodes &amp; last, so a literal "&lt;" someone typed survives as text', () => {
    expect(richTextToPlainText('<p>scrivi &amp;lt; qui</p>')).toBe(
      'scrivi &lt; qui',
    );
  });

  it('is empty for empty input', () => {
    expect(richTextToPlainText('')).toBe('');
  });

  // A single-pass `replace(/<[^>]*>/g, '')` removes the inner match and
  // lets the outside reassemble into `<script`. Nothing here writes that
  // — the value has been sanitised already — but this function hands
  // plain text to callers and must not rely on that.
  it('leaves no tag fragment behind, however the input is nested', () => {
    for (const attack of [
      '<p><scr<script>ipt>alert(1)</p>',
      '<p><<div>div>x</p>',
      '<p><img src=x onerror=alert(1)>y</p>',
    ]) {
      const out = richTextToPlainText(attack);
      expect(out, attack).not.toContain('<');
      expect(out, attack).not.toContain('>');
    }
  });
});
