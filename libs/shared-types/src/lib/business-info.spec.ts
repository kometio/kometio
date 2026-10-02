import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPES,
  businessInfoSchema,
  isBusinessType,
  openingHoursDaySchema,
  openingHoursRangeSchema,
} from './business-info';

describe('business-info schemas', () => {
  it('accepts a valid opening hours range', () => {
    expect(
      openingHoursRangeSchema.safeParse({ opens: '09:00', closes: '13:00' })
        .success,
    ).toBe(true);
  });

  it('rejects a range not in HH:MM format', () => {
    expect(
      openingHoursRangeSchema.safeParse({ opens: '9am', closes: '13:00' })
        .success,
    ).toBe(false);
  });

  it('accepts a day with multiple ranges, e.g. a lunch closure', () => {
    const result = openingHoursDaySchema.safeParse({
      dayOfWeek: 'monday',
      ranges: [
        { opens: '09:00', closes: '13:00' },
        { opens: '15:00', closes: '19:00' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a day with no ranges (closed)', () => {
    expect(
      openingHoursDaySchema.safeParse({ dayOfWeek: 'sunday', ranges: [] })
        .success,
    ).toBe(true);
  });

  it('accepts business info with everything null', () => {
    const result = businessInfoSchema.safeParse({
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      businessType: null,
      openingHours: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts fully populated business info', () => {
    const result = businessInfoSchema.safeParse({
      businessAddress: {
        street: 'Via Roma 1',
        postalCode: '20121',
        city: 'Milano',
        country: 'IT',
      },
      businessPhone: '+39 02 1234567',
      businessEmail: null,
      businessType: 'Restaurant',
      openingHours: [{ dayOfWeek: 'monday', ranges: [] }],
    });
    expect(result.success).toBe(true);
  });
});

describe('BUSINESS_TYPES', () => {
  it('knows the types it offers, and no others', () => {
    expect(isBusinessType('Restaurant')).toBe(true);
    expect(isBusinessType('LocalBusiness')).toBe(true);
    expect(isBusinessType('restaurant')).toBe(false);
    expect(isBusinessType('')).toBe(false);
    expect(isBusinessType('Spaceship')).toBe(false);
  });

  it('lists every type once', () => {
    expect(new Set(BUSINESS_TYPES).size).toBe(BUSINESS_TYPES.length);
  });
});
