import { describe, expect, it } from 'vitest';
import { labelledImageAlt, resolveImageAlt } from './image-alt';

const fromLibrary = { alt: 'A red door' };

describe('resolveImageAlt', () => {
  it("says the block's own text, and not the library's, when it has one", () => {
    expect(
      resolveImageAlt({
        alt: 'The front door',
        isDecorative: false,
        media: fromLibrary,
      }),
    ).toBe('The front door');
  });

  it("falls back to the file's text while the block has none — empty or only spaces", () => {
    for (const alt of ['', '   ']) {
      expect(
        resolveImageAlt({ alt, isDecorative: false, media: fromLibrary }),
      ).toBe('A red door');
    }
  });

  it('stays decorative, empty, whatever else holds a text', () => {
    expect(
      resolveImageAlt({
        alt: 'typed before the flag',
        isDecorative: true,
        media: fromLibrary,
      }),
    ).toBe('');
    expect(
      resolveImageAlt({ alt: '', isDecorative: true, media: fromLibrary }),
    ).toBe('');
  });

  it('is empty when nobody wrote anything — a file picked before the library held a text, or none picked', () => {
    expect(resolveImageAlt({ alt: '', isDecorative: false, media: {} })).toBe(
      '',
    );
    expect(resolveImageAlt({ alt: '', isDecorative: false, media: null })).toBe(
      '',
    );
  });
});

describe('labelledImageAlt', () => {
  it('says what the picture is of after its role', () => {
    expect(labelledImageAlt('Before', fromLibrary)).toBe('Before: A red door');
  });

  it('is the role alone when the library holds nothing for the file', () => {
    expect(labelledImageAlt('Before', {})).toBe('Before');
    expect(labelledImageAlt('Before', { alt: '  ' })).toBe('Before');
    expect(labelledImageAlt('Before', null)).toBe('Before');
  });
});
