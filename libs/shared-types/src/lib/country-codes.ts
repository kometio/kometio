import { z } from 'zod';

/**
 * Every ISO 3166-1 alpha-2 country code, for the controls that need a list
 * of countries: the business address's country picker and the legal
 * documents' jurisdiction.
 *
 * Codes only, no names. `Intl.DisplayNames` turns a code into a name in
 * whatever language is asked for, in the browser and in Node alike, so a
 * table of ~250 names per language would be a table to translate, to keep
 * in step with reality, and to get wrong — for something the platform
 * already knows.
 *
 * Sorting belongs to the caller, because it depends on the language the
 * names came out in (`Intl.Collator`), not on this list.
 */
export const ISO_COUNTRY_CODES = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const;

export type IsoCountryCode = (typeof ISO_COUNTRY_CODES)[number];

const KNOWN_COUNTRY_CODES: ReadonlySet<string> = new Set(ISO_COUNTRY_CODES);

/** Whether a stored string is one of the codes this product offers, and so may be turned into a name. */
export function isIsoCountryCode(value: string): value is IsoCountryCode {
  return KNOWN_COUNTRY_CODES.has(value);
}

/** A code this product offers, for the body of a request that names a country. */
export const isoCountryCodeSchema = z
  .string()
  .refine((value): value is IsoCountryCode => isIsoCountryCode(value), {
    message: 'must be an ISO 3166-1 alpha-2 country code, e.g. IT',
  });

/**
 * A country's name in the language asked for, or the code as it was
 * stored when that is not a country this product offers.
 *
 * `Intl.DisplayNames` is happy to answer for codes that are not countries —
 * `ZZ` comes back as "Unknown Region", which on a real site's contact
 * details reads worse than the two letters somebody stored. Anything
 * unexpected prints as it was stored, which is the only honest thing to
 * show and the only one that makes the mistake findable.
 */
export function getCountryDisplayName(code: string, locale: string): string {
  if (code === '') return '';
  if (!isIsoCountryCode(code)) return code;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    // A malformed `locale` reaches here, not a malformed code.
    return code;
  }
}

/**
 * The countries, named in `locale` and sorted the way that language sorts —
 * which is why the sort happens here and not in the list of codes:
 * "Österreich" files under O in German and after Z with a naive
 * comparison.
 */
export function listCountries(
  locale: string,
): { code: IsoCountryCode; name: string }[] {
  const collator = new Intl.Collator(locale);
  return ISO_COUNTRY_CODES.map((code) => ({
    code,
    name: getCountryDisplayName(code, locale),
  })).sort((a, b) => collator.compare(a.name, b.name));
}
