import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TotpAuthenticator } from './totp-authenticator.adapter';

/*
 * RFC 6238, Appendix B: the secret "12345678901234567890" (SHA-1). The RFC
 * prints eight digits; the six an authenticator app shows are the last six.
 */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_VECTORS: [seconds: number, code: string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

const at = (seconds: number) => new Date(seconds * 1000);

/** An independent reading of RFC 4226, for a secret the spec did not pick. */
function referenceCode(secret: string, seconds: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 15;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

describe('TotpAuthenticator', () => {
  const totp = new TotpAuthenticator();

  describe('verify', () => {
    it.each(RFC_VECTORS)(
      'accepts the code the RFC gives for second %i',
      (seconds, code) => {
        const result = totp.verify({
          secret: RFC_SECRET,
          code,
          at: at(seconds),
        });

        expect(result).toEqual({ step: Math.floor(seconds / 30) });
      },
    );

    it('accepts the code of the step before and the step after, for two clocks that differ', () => {
      // The RFC's code for second 59 is step 1; second 89 is step 2.
      expect(
        totp.verify({ secret: RFC_SECRET, code: '287082', at: at(89) }),
      ).toEqual({ step: 1 });
      expect(
        totp.verify({ secret: RFC_SECRET, code: '287082', at: at(29) }),
      ).toEqual({ step: 1 });
    });

    it('refuses a code two steps away', () => {
      expect(
        totp.verify({ secret: RFC_SECRET, code: '287082', at: at(120) }),
      ).toBeNull();
    });

    it('refuses a code that was already used, for the rest of its thirty seconds', () => {
      const first = totp.verify({
        secret: RFC_SECRET,
        code: '287082',
        at: at(59),
      });
      expect(first).toEqual({ step: 1 });

      expect(
        totp.verify({
          secret: RFC_SECRET,
          code: '287082',
          at: at(59),
          notBeforeStep: (first?.step ?? 0) + 1,
        }),
      ).toBeNull();
    });

    it('refuses what is not six digits, without computing anything', () => {
      for (const code of ['', '28708', '2870822', 'abcdef', '28 70 82x']) {
        expect(
          totp.verify({ secret: RFC_SECRET, code, at: at(59) }),
        ).toBeNull();
      }
    });

    it('ignores the spaces an app puts in the middle of a code', () => {
      expect(
        totp.verify({ secret: RFC_SECRET, code: '287 082', at: at(59) }),
      ).toEqual({ step: 1 });
    });

    it('refuses a secret that is not base32 instead of answering for it', () => {
      expect(
        totp.verify({ secret: 'not base32 !', code: '287082', at: at(59) }),
      ).toBeNull();
    });
  });

  describe('generateSecret', () => {
    it('makes 160 bits of base32, and a different one each time', () => {
      const first = totp.generateSecret();
      const second = totp.generateSecret();

      expect(first).toMatch(/^[A-Z2-7]{32}$/);
      expect(second).not.toBe(first);
    });

    it('makes a secret its own verify accepts a code for', () => {
      const secret = totp.generateSecret();
      const now = new Date();
      const code = referenceCode(secret, now.getTime() / 1000);

      expect(totp.verify({ secret, code, at: now })).not.toBeNull();
    });
  });

  describe('provisioningUri', () => {
    it('is the otpauth address an app reads, with the issuer twice as the format asks', () => {
      const uri = totp.provisioningUri({
        secret: RFC_SECRET,
        accountName: 'anna@example.test',
        issuer: 'Studio Rossi',
      });

      const url = new URL(uri);
      expect(url.protocol).toBe('otpauth:');
      expect(url.host).toBe('totp');
      expect(decodeURIComponent(url.pathname)).toBe(
        '/Studio Rossi:anna@example.test',
      );
      expect(url.searchParams.get('secret')).toBe(RFC_SECRET);
      expect(url.searchParams.get('issuer')).toBe('Studio Rossi');
      expect(url.searchParams.get('algorithm')).toBe('SHA1');
      expect(url.searchParams.get('digits')).toBe('6');
      expect(url.searchParams.get('period')).toBe('30');
    });
  });

  describe('recovery codes', () => {
    it('makes ten characters in two groups, none of them look-alikes', () => {
      for (let i = 0; i < 200; i += 1) {
        expect(totp.generateRecoveryCode()).toMatch(
          /^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$/,
        );
      }
    });

    it('does not make the same one twice', () => {
      const codes = new Set(
        Array.from({ length: 500 }, () => totp.generateRecoveryCode()),
      );

      expect(codes.size).toBe(500);
    });

    it('stores the same thing however it was written down', () => {
      const hash = totp.hashRecoveryCode('abcde-fghjk');

      expect(totp.hashRecoveryCode('ABCDE-FGHJK')).toBe(hash);
      expect(totp.hashRecoveryCode('abcde fghjk')).toBe(hash);
      expect(totp.hashRecoveryCode(' abcdefghjk ')).toBe(hash);
      expect(totp.hashRecoveryCode('abcde-fghjm')).not.toBe(hash);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('tells a recovery code from the six digits of the app', () => {
      expect(totp.looksLikeRecoveryCode('287082')).toBe(false);
      expect(totp.looksLikeRecoveryCode('287 082')).toBe(false);
      expect(totp.looksLikeRecoveryCode('abcde-fghjk')).toBe(true);
      expect(totp.looksLikeRecoveryCode('2870823456')).toBe(true);
      expect(totp.looksLikeRecoveryCode('')).toBe(true);
    });
  });
});
