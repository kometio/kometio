import { z } from 'zod';
import { getCountryDisplayName } from './country-codes';

/**
 * Site-level business info for schema.org LocalBusiness markup (see
 * docs/adr/0014) — not page content, kept separate from content-model.ts
 * for the same reason SeoMeta lives there rather than here: this describes
 * the business itself, not a page or a block.
 */
export const dayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

export const openingHoursRangeSchema = z.object({
  opens: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM'),
  closes: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM'),
});
export type OpeningHoursRange = z.infer<typeof openingHoursRangeSchema>;

// One entry per weekday, each holding zero or more ranges — empty means
// closed that day, more than one supports a midday closure (e.g. a
// restaurant closed 14:00-18:00 between lunch and dinner service).
export const openingHoursDaySchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  ranges: z.array(openingHoursRangeSchema),
});
export type OpeningHoursDay = z.infer<typeof openingHoursDaySchema>;

export const openingHoursSchema = z.array(openingHoursDaySchema);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

/**
 * Where the business is, in parts rather than as one line of prose.
 *
 * schema.org accepts a plain string for `address`, which is what this was
 * until now (ADR-0014), and Google's Rich Results guidelines have always
 * asked for a `PostalAddress` instead — a machine cannot tell the town
 * from the street in "Via Roma 1, 00100 Roma".
 *
 * Every part is a string and may be empty; the address as a whole is
 * nullable. Someone who knows only the street should be able to type only
 * the street, and an address with nothing in it is no address at all.
 */
export const businessAddressSchema = z.object({
  /** Street and number on one line, which is how every country writes it. */
  street: z.string(),
  postalCode: z.string(),
  /** The town. `addressLocality` in schema.org, which is not the province. */
  city: z.string(),
  /**
   * ISO 3166-1 alpha-2, uppercase — `IT`, not `Italia`.
   *
   * A code and not the typed name because it has two jobs a name cannot
   * do: schema.org's `addressCountry` is specified as this code, and the
   * order of the lines below depends on which country it is.
   */
  country: z.string(),
});
export type BusinessAddress = z.infer<typeof businessAddressSchema>;

export const EMPTY_BUSINESS_ADDRESS: BusinessAddress = {
  street: '',
  postalCode: '',
  city: '',
  country: '',
};

export function isBusinessAddressEmpty(address: BusinessAddress): boolean {
  return (
    address.street.trim() === '' &&
    address.postalCode.trim() === '' &&
    address.city.trim() === '' &&
    address.country.trim() === ''
  );
}

/**
 * The countries that write the postcode AFTER the town rather than before
 * it — "London SW1A 1AA", not "SW1A 1AA London".
 *
 * A short list rather than a full address-format database (there are
 * libraries that hold one, and it is a large dependency for one line of
 * output). The default is the order most of continental Europe uses,
 * which is where this product's users are; these are the ones where that
 * default reads plainly wrong to someone who lives there.
 */
const POSTAL_CODE_AFTER_CITY = new Set(['AU', 'CA', 'GB', 'IE', 'NZ', 'US']);

/**
 * The address as the lines you would write on an envelope.
 *
 * `locale` names the country in the reader's language, through
 * `Intl.DisplayNames` — so an Italian site says "Italia" and its English
 * translation says "Italy" from the same stored `IT`. An unknown or
 * malformed code falls back to printing the code itself rather than
 * dropping the line: it is what somebody chose, and hiding it would hide
 * the mistake too.
 */
export function formatBusinessAddressLines(
  address: BusinessAddress,
  locale: string,
): string[] {
  const street = address.street.trim();
  const postalCode = address.postalCode.trim();
  const city = address.city.trim();
  const country = address.country.trim().toUpperCase();

  const townLine = POSTAL_CODE_AFTER_CITY.has(country)
    ? [city, postalCode]
    : [postalCode, city];

  return [
    street,
    townLine.filter(Boolean).join(' '),
    getCountryDisplayName(country, locale),
  ].filter((line) => line !== '');
}

/** The same address on one line — for a map search, or for prose. */
export function formatBusinessAddress(
  address: BusinessAddress,
  locale: string,
): string {
  return formatBusinessAddressLines(address, locale).join(', ');
}

/**
 * The kinds of business the editor offers, written as the schema.org type
 * they become in the site's structured data. The field itself stays free
 * text (a site may have been given any other schema.org type, and the
 * public site writes it out as it is); this is what the picker lists.
 * `LocalBusiness` is the general one, offered as "Other".
 */
export const BUSINESS_TYPES = [
  'Restaurant',
  'BarOrPub',
  'Hotel',
  'Store',
  'ProfessionalService',
  'MedicalClinic',
  'SportsActivityLocation',
  'BeautySalon',
  'RealEstateAgent',
  'LegalService',
  'AccountingService',
  'AutoRepair',
  'LocalBusiness',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function isBusinessType(value: string): value is BusinessType {
  return BUSINESS_TYPES.some((type) => type === value);
}

export const businessInfoSchema = z.object({
  businessAddress: businessAddressSchema.nullable(),
  businessPhone: z.string().nullable(),
  /**
   * The address people write to. It was the one contact detail Business
   * info did not have, so the Contact details block could show a phone and
   * not an email, and the legal documents wizard asked for one every time.
   */
  businessEmail: z.string().nullable(),
  businessType: z.string().nullable(),
  openingHours: openingHoursSchema.nullable(),
});
export type BusinessInfo = z.infer<typeof businessInfoSchema>;
