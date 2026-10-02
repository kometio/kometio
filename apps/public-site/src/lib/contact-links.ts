/**
 * The links a business's own contact details turn into — shared by the
 * Contacts block and the mobile contact bar, which put the same phone
 * number and the same address behind different buttons.
 */

/** `tel:` wants the digits and a leading `+`, not the spaces and dashes a person reads. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * The address on a map. OpenStreetMap rather than a map with an account
 * behind it, as the Contacts block has always done: opening it sends the
 * address to nobody who then follows the visitor around.
 */
export function mapSearchHref(address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}

/**
 * A WhatsApp chat with a number, which wa.me wants as digits only with
 * the country code and no `+` — "+39 333 123 4567" is `393331234567`.
 * `null` for something with no digits in it at all.
 */
export function whatsAppHref(number: string): string | null {
  const digits = number.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}
