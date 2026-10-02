import type { BookingProvider } from '@kometio/shared-types';

/**
 * The hosts each booking service serves its booking pages from — checked
 * against 2026-09-13 with real requests: Calendly answers
 * `X-Frame-Options: ALLOWALL`, and Cal.com and Google's appointment pages
 * set nothing that forbids a frame.
 *
 * The same list is the page's `frame-src` (content-security-policy.ts):
 * an address accepted here and refused there would be a grey box.
 */
export const BOOKING_EMBED_HOSTS: Record<BookingProvider, readonly string[]> = {
  calendly: ['calendly.com'],
  calcom: ['cal.com', 'app.cal.com'],
  google: ['calendar.google.com'],
};

/**
 * The address to frame for a booking page, or `null` when it is not one
 * of the chosen service's own — a pasted address from anywhere else is
 * not framed, whatever it is.
 */
export function bookingEmbedUrl(
  provider: BookingProvider,
  url: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    !BOOKING_EMBED_HOSTS[provider].includes(parsed.hostname)
  ) {
    return null;
  }
  // `gv=true` is what Google's own "embed" code adds: the booking view
  // without the calendar's navigation around it.
  if (provider === 'google' && !parsed.searchParams.has('gv')) {
    parsed.searchParams.set('gv', 'true');
  }
  return parsed.href;
}
