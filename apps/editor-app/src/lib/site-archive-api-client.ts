import { API_BASE_URL } from './http-client';

/**
 * Where the whole site is downloaded from (docs/adr/0105). A link, not a
 * request the editor makes: the archive can be large, and only the browser can
 * write it to disk as it arrives. Session auth is a cookie, so a plain link
 * carries it.
 */
export function siteArchiveUrl(): string {
  return `${API_BASE_URL}/site-archive`;
}
