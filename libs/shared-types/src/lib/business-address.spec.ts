import { describe, expect, it } from 'vitest';
import {
  EMPTY_BUSINESS_ADDRESS,
  formatBusinessAddress,
  formatBusinessAddressLines,
  isBusinessAddressEmpty,
  ISO_COUNTRY_CODES,
  type BusinessAddress,
} from '../index';

const MILANO: BusinessAddress = {
  street: 'Via Giuseppe Garibaldi 12',
  postalCode: '20121',
  city: 'Milano',
  country: 'IT',
};

describe('formatBusinessAddressLines', () => {
  it('writes the postcode before the town, as most of Europe does', () => {
    expect(formatBusinessAddressLines(MILANO, 'it')).toEqual([
      'Via Giuseppe Garibaldi 12',
      '20121 Milano',
      'Italia',
    ]);
  });

  it('writes the postcode after the town where that is how it is written', () => {
    // "London SW1A 1AA", not "SW1A 1AA London" — the whole reason the
    // country is stored as a code rather than as typed text.
    expect(
      formatBusinessAddressLines(
        {
          street: '10 Downing Street',
          postalCode: 'SW1A 2AA',
          city: 'London',
          country: 'GB',
        },
        'en',
      ),
    ).toEqual(['10 Downing Street', 'London SW1A 2AA', 'United Kingdom']);
  });

  it('names the country in the language it is being read in', () => {
    // One stored value, two sites: the same `IT` serves both languages,
    // which is what a free-text country could never do.
    expect(formatBusinessAddressLines(MILANO, 'en').at(-1)).toBe('Italy');
    expect(formatBusinessAddressLines(MILANO, 'de').at(-1)).toBe('Italien');
  });

  it('leaves out the parts nobody filled in', () => {
    expect(
      formatBusinessAddressLines(
        { ...EMPTY_BUSINESS_ADDRESS, street: 'Via Roma 1' },
        'it',
      ),
    ).toEqual(['Via Roma 1']);
  });

  it('keeps a town with no postcode on its own line', () => {
    expect(
      formatBusinessAddressLines({ ...MILANO, postalCode: '' }, 'it'),
    ).toEqual(['Via Giuseppe Garibaldi 12', 'Milano', 'Italia']);
  });

  it('prints a code that is not one of the offered countries as stored', () => {
    // `Intl.DisplayNames` answers "Regione sconosciuta" for `ZZ`, which on
    // a real contact block reads worse than the two letters — and hides
    // that something is wrong. Hiding it would hide the mistake too.
    expect(
      formatBusinessAddressLines({ ...MILANO, country: 'ZZ' }, 'it').at(-1),
    ).toBe('ZZ');
  });

  it('does not throw on a stored value that is not a country code at all', () => {
    // `Intl.DisplayNames` throws on one, and a column is not a promise.
    expect(
      formatBusinessAddressLines({ ...MILANO, country: 'Italia' }, 'it').at(-1),
    ).toBe('ITALIA');
  });

  it('ignores the spaces somebody typed around a part', () => {
    expect(
      formatBusinessAddressLines(
        {
          street: '  Via Roma 1  ',
          postalCode: ' 20121 ',
          city: ' Milano ',
          country: ' it ',
        },
        'it',
      ),
    ).toEqual(['Via Roma 1', '20121 Milano', 'Italia']);
  });
});

describe('formatBusinessAddress', () => {
  it('joins the same lines with commas, for a map search or for prose', () => {
    expect(formatBusinessAddress(MILANO, 'it')).toBe(
      'Via Giuseppe Garibaldi 12, 20121 Milano, Italia',
    );
  });
});

describe('isBusinessAddressEmpty', () => {
  it('is true for an address with nothing in it, spaces included', () => {
    expect(isBusinessAddressEmpty(EMPTY_BUSINESS_ADDRESS)).toBe(true);
    expect(
      isBusinessAddressEmpty({ ...EMPTY_BUSINESS_ADDRESS, city: '   ' }),
    ).toBe(true);
  });

  it('is false as soon as one part is filled', () => {
    expect(
      isBusinessAddressEmpty({ ...EMPTY_BUSINESS_ADDRESS, city: 'Milano' }),
    ).toBe(false);
  });
});

describe('ISO_COUNTRY_CODES', () => {
  it('has no duplicates and every code has a name', () => {
    // The list is hand-written, and a duplicate would draw the same
    // country twice in the picker.
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(ISO_COUNTRY_CODES.length);
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const unnamed = ISO_COUNTRY_CODES.filter((code) => names.of(code) === code);
    expect(unnamed).toEqual([]);
  });
});
