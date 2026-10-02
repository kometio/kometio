import { describe, expect, it } from 'vitest';
import { parseSearchExcerpt } from './search-excerpt';

describe('parseSearchExcerpt', () => {
  it('returns a single unmatched segment when there are no markers', () => {
    expect(parseSearchExcerpt('nessun match qui')).toEqual([
      { text: 'nessun match qui', matched: false },
    ]);
  });

  it('splits matched and unmatched segments', () => {
    const excerpt = 'Il nostro \x01idraulico\x02 esperto risolve tutto';

    expect(parseSearchExcerpt(excerpt)).toEqual([
      { text: 'Il nostro ', matched: false },
      { text: 'idraulico', matched: true },
      { text: ' esperto risolve tutto', matched: false },
    ]);
  });

  it('handles multiple matches in the same excerpt', () => {
    const excerpt = '\x01idraulico\x02 a Roma, \x01idraulico\x02 24 ore';

    const segments = parseSearchExcerpt(excerpt);
    const matchedTexts = segments.filter((s) => s.matched).map((s) => s.text);

    expect(matchedTexts).toEqual(['idraulico', 'idraulico']);
  });

  it('never treats stray angle brackets in the source text as HTML', () => {
    const excerpt = 'prezzo \x01scontato\x02 <b>solo oggi</b>';

    const segments = parseSearchExcerpt(excerpt);

    expect(segments.map((s) => s.text).join('')).toContain('<b>solo oggi</b>');
    expect(segments.every((s) => typeof s.text === 'string')).toBe(true);
  });
});
