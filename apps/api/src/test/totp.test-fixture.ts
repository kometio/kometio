import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * What an authenticator app shows for `secret` during the thirty seconds
 * `at` falls in. An independent reading of RFC 4226 and 6238 and not the
 * API's own adapter, so a spec that asks the API to accept this code is
 * asking whether it agrees with the standard.
 */
export function totpCodeAt(secret: string, at: Date): string {
  let bits = '';
  for (const char of secret) {
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 15;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}
