/**
 * The second factor of a sign-in: a code an authenticator app makes from a
 * secret both sides hold and the time (RFC 6238), six digits, a new one every
 * thirty seconds.
 *
 * Implemented by @kometio/totp-authenticator. Nothing here stores anything:
 * where the secret is kept, sealed, is `SecondFactorRepositoryPort`'s.
 */
export interface TotpPort {
  /** A new shared secret, as the base32 text an authenticator app is given. */
  generateSecret(): string;

  /**
   * The `otpauth://` address an authenticator app reads, which is what the
   * QR code of the enrolment screen says. `issuer` and `accountName` are
   * what the app shows beside the code.
   */
  provisioningUri(input: {
    secret: string;
    accountName: string;
    issuer: string;
  }): string;

  /**
   * The time step `code` is the answer for at `at`, or `null` when it is
   * the answer for none within the drift the clocks of two machines are
   * allowed (a step either side).
   *
   * `notBeforeStep` is the step after the last one that was accepted: a
   * code is good once, so one that was just used — read over a shoulder,
   * or from a log — is refused for the rest of its thirty seconds
   * (RFC 6238 §5.2).
   */
  verify(input: {
    secret: string;
    code: string;
    at: Date;
    notBeforeStep?: number;
  }): { step: number } | null;

  /**
   * A recovery code: what a person types when they have lost the
   * authenticator. Random, typed by hand from a piece of paper, so it avoids
   * the characters that look alike, and it is grouped (`abcde-fghjk`) so it
   * can be read out.
   */
  generateRecoveryCode(): string;

  /**
   * What is stored of a recovery code. The same for every way of typing one
   * (case, a hyphen or a space in the middle), so that what was written down
   * is what is found.
   */
  hashRecoveryCode(code: string): string;

  /**
   * Whether what was typed has the look of a recovery code and not of a
   * six-digit code: which of the two checks is asked, and not a guess.
   */
  looksLikeRecoveryCode(input: string): boolean;
}
