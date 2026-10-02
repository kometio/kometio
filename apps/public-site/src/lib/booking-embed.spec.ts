import { describe, expect, it } from 'vitest';
import { bookingEmbedUrl } from './booking-embed';

describe('bookingEmbedUrl', () => {
  it('frames a booking page from the chosen service', () => {
    expect(bookingEmbedUrl('calendly', 'https://calendly.com/acme/30min')).toBe(
      'https://calendly.com/acme/30min',
    );
    expect(bookingEmbedUrl('calcom', ' https://cal.com/acme/intro ')).toBe(
      'https://cal.com/acme/intro',
    );
  });

  it("adds Google's embedded view when the address lacks it", () => {
    expect(
      bookingEmbedUrl(
        'google',
        'https://calendar.google.com/calendar/appointments/schedules/abc',
      ),
    ).toBe(
      'https://calendar.google.com/calendar/appointments/schedules/abc?gv=true',
    );
  });

  it('refuses an address from another service, another host or without https', () => {
    expect(bookingEmbedUrl('calendly', 'https://cal.com/acme')).toBeNull();
    expect(
      bookingEmbedUrl('calendly', 'https://calendly.com.evil.example/x'),
    ).toBeNull();
    expect(bookingEmbedUrl('calcom', 'http://cal.com/acme')).toBeNull();
    expect(bookingEmbedUrl('google', 'not a url')).toBeNull();
  });
});
