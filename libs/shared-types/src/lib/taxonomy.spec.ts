import { describe, expect, it } from 'vitest';
import { localizedSeoMetaSchema, localizedTextSchema } from './taxonomy';

describe('localized values', () => {
  it('accepts any locale a site happens to have', () => {
    const parsed = localizedTextSchema.parse({ it: 'Caffè', 'pt-BR': 'Café' });

    expect(parsed['pt-BR']).toBe('Café');
  });

  /*
   * A missing language is not an error: a term is a concept that exists
   * whether or not somebody has written its name in Norwegian yet, and
   * the caller falls back the way every other locale-keyed value here
   * does.
   */
  it('accepts a value that exists in no language yet', () => {
    expect(localizedTextSchema.parse({})).toEqual({});
  });

  it('validates the SEO block per language with the schema pages already use', () => {
    expect(() =>
      localizedSeoMetaSchema.parse({ it: { title: 'Caffè' } }),
    ).toThrow();
    expect(
      localizedSeoMetaSchema.parse({
        it: { title: 'Caffè', description: 'Le macchine' },
      }).it.description,
    ).toBe('Le macchine');
  });
});
