/*
 * Seals a secret before it is stored and opens it when it is needed — an
 * API key a site owner typed into the editor, never written to the
 * database in the clear (docs/adr — page generation).
 *
 * A sealed value names the key it was sealed with, so the key can be
 * replaced without making old values unreadable: a cipher holds the
 * current key to seal with and every key it may still open with.
 *
 * Implemented by @kometio/aes-secret-cipher.
 */
export interface SecretCipherPort {
  seal(plaintext: string): string;
  /** Throws SecretUnreadableError for a value this cipher cannot open. */
  open(sealed: string): string;
}
