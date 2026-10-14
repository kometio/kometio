import { isKnownProbe, type RequestedAddress } from '@kometio/shared-types';

/** What a WordPress site used to answer at its front door, by a number: `/?p=123`, `/?page_id=4`. */
const MIGRATION_PARAMS = [
  'p',
  'page_id',
  'cat',
  'tag',
  'attachment_id',
  'author',
  'm',
];

const MAX_LENGTH = 200;
const MAX_SEGMENTS = 8;

/**
 * What to remember of an address that was asked for and not found, or
 * `null` to remember nothing.
 *
 * The path, never the query: a query can carry a token, and the list is read
 * by whoever has the editor. The one exception is what a migrated site is
 * asked at its front door (`/?p=123`), which is the whole of the address and
 * which a person turns into a rule as it is.
 */
export function missingAddressOf(address: RequestedAddress): string | null {
  if (address.path === '/') {
    for (const key of MIGRATION_PARAMS) {
      const value = address.params.get(key);
      if (value !== undefined && /^\d{1,12}$/.test(value)) {
        return `/?${key}=${value}`;
      }
    }
    return null;
  }
  if (address.path.length > MAX_LENGTH) return null;
  if (address.path.split('/').length - 1 > MAX_SEGMENTS) return null;
  if (isKnownProbe(address.path)) return null;
  return address.path;
}
