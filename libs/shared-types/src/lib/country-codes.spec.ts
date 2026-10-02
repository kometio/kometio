import { describe, expect, it } from 'vitest';
import {
  ISO_COUNTRY_CODES,
  getCountryDisplayName,
  isIsoCountryCode,
  isoCountryCodeSchema,
  listCountries,
} from './country-codes';

describe('isIsoCountryCode', () => {
  it('accepts the codes the product offers, and nothing else', () => {
    expect(isIsoCountryCode('IT')).toBe(true);
    expect(isIsoCountryCode('it')).toBe(false);
    expect(isIsoCountryCode('ZZ')).toBe(false);
    expect(isIsoCountryCode('')).toBe(false);
  });
});

describe('isoCountryCodeSchema', () => {
  it('takes a code and refuses a name, a lower-case code and one that is no country', () => {
    expect(isoCountryCodeSchema.safeParse('IT').success).toBe(true);
    for (const refused of ['Italia', 'it', 'ZZ', '']) {
      expect(isoCountryCodeSchema.safeParse(refused).success).toBe(false);
    }
  });
});

describe('getCountryDisplayName', () => {
  it('names a country in the language asked for', () => {
    expect(getCountryDisplayName('IT', 'it')).toBe('Italia');
    expect(getCountryDisplayName('IT', 'en')).toBe('Italy');
  });

  it('says nothing for an empty code', () => {
    expect(getCountryDisplayName('', 'it')).toBe('');
  });

  it('prints a code it does not offer as it was stored, rather than "Unknown Region"', () => {
    expect(getCountryDisplayName('ZZ', 'en')).toBe('ZZ');
  });

  it('falls back to the code when the language is malformed', () => {
    expect(getCountryDisplayName('IT', 'not a locale')).toBe('IT');
  });
});

describe('listCountries', () => {
  it('lists every code once, named in the language asked for', () => {
    const countries = listCountries('en');

    expect(countries).toHaveLength(ISO_COUNTRY_CODES.length);
    expect(countries.find((country) => country.code === 'DE')?.name).toBe(
      'Germany',
    );
  });

  it('sorts by the names, the way that language sorts them', () => {
    const names = listCountries('de').map((country) => country.name);

    // "Österreich" files with the O's in German, not after the Z's.
    expect(names.indexOf('Österreich')).toBeLessThan(names.indexOf('Polen'));
    expect(names.indexOf('Österreich')).toBeGreaterThan(
      names.indexOf('Norwegen'),
    );
  });
});
