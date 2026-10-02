import { describe, expect, it } from 'vitest';
import { mapSearchHref, telHref, whatsAppHref } from './contact-links';

describe('contact links', () => {
  it('dials the digits of a number written for people', () => {
    expect(telHref('+39 051 123-456')).toBe('tel:+39051123456');
  });

  it('searches the map for the address, encoded', () => {
    expect(mapSearchHref('Via Roma 1, Bologna')).toBe(
      'https://www.openstreetmap.org/search?query=Via%20Roma%201%2C%20Bologna',
    );
  });

  it('opens WhatsApp on the digits alone, and on nothing without any', () => {
    expect(whatsAppHref('+39 333 123 4567')).toBe('https://wa.me/393331234567');
    expect(whatsAppHref('  ')).toBeNull();
  });
});
