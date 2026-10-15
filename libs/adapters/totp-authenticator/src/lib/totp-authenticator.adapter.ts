import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { TotpPort } from '@kometio/ports';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 160 bits, the size RFC 4226 recommends for a SHA-1 key. */
const SECRET_BYTES = 20;
const STEP_SECONDS = 30;
const DIGITS = 6;
/** A step either side of the current one: two clocks are never quite together. */
const DRIFT_STEPS = 1;

/** No 0, o, 1, l or i: a code is read off paper. */
const RECOVERY_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const RECOVERY_GROUP = 5;
const RECOVERY_GROUPS = 2;

/** RFC 4648 base32, no padding: what authenticator apps are given. */
function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** `null` for text that is not base32, so a damaged secret answers "no" and never throws. */
function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s=]+/g, '').toUpperCase();
  if (clean.length === 0) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP with SHA-1 and six digits. */
function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  // The counter is a 64-bit big-endian integer; a step number fits in 53 bits.
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * TOTP (RFC 6238) with `node:crypto` and nothing else: SHA-1, six digits,
 * thirty seconds, which is what every authenticator app does by default and
 * the only combination all of them support.
 *
 * Written here and not taken from a package because it is forty lines with
 * published test vectors (the spec runs them), and a second-factor
 * dependency is one more place a supply-chain compromise would sit exactly
 * where it is worth the most.
 */
export class TotpAuthenticator implements TotpPort {
  generateSecret(): string {
    return base32Encode(randomBytes(SECRET_BYTES));
  }

  provisioningUri(input: {
    secret: string;
    accountName: string;
    issuer: string;
  }): string {
    const issuer = encodeURIComponent(input.issuer);
    const label = `${issuer}:${encodeURIComponent(input.accountName)}`;
    const query = new URLSearchParams({
      secret: input.secret,
      issuer: input.issuer,
      algorithm: 'SHA1',
      digits: String(DIGITS),
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }

  verify(input: {
    secret: string;
    code: string;
    at: Date;
    notBeforeStep?: number;
  }): { step: number } | null {
    const code = input.code.replace(/\s+/g, '');
    if (!new RegExp(`^\\d{${DIGITS}}$`).test(code)) return null;
    const key = base32Decode(input.secret);
    if (!key) return null;

    const current = Math.floor(input.at.getTime() / 1000 / STEP_SECONDS);
    const notBefore = input.notBeforeStep ?? 0;
    // Every candidate is computed and compared, accepted or not, so that
    // how long the answer takes does not say which step matched.
    let accepted: number | null = null;
    for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
      const step = current + offset;
      if (step < 0) continue;
      const matches = sameCode(code, hotp(key, step));
      if (matches && step >= notBefore && accepted === null) accepted = step;
    }
    return accepted === null ? null : { step: accepted };
  }

  generateRecoveryCode(): string {
    const group = () =>
      Array.from(
        { length: RECOVERY_GROUP },
        () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
      ).join('');
    return Array.from({ length: RECOVERY_GROUPS }, group).join('-');
  }

  hashRecoveryCode(code: string): string {
    return createHash('sha256')
      .update(normaliseRecoveryCode(code))
      .digest('hex');
  }

  looksLikeRecoveryCode(input: string): boolean {
    // Six digits is a code from the app; everything else typed is tried as a
    // recovery code, which is the one that has letters.
    return !/^\d{6}$/.test(input.replace(/\s+/g, ''));
  }
}

/** Case, hyphens and spaces are the way a code is written down, not part of it. */
function normaliseRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]+/g, '');
}
