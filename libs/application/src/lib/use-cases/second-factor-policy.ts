/**
 * The numbers of the second step of a sign-in (docs/adr/0137), in one place
 * because the use cases and their specs read the same ones.
 */

/** How long a person has, after the right password, to give the code. */
export const SECOND_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * How many wrong codes one challenge takes before it is spent and the person
 * goes back to the password. With a drift of one step a six-digit code has
 * three right answers in a million; five tries at a time, each round behind
 * a password and a captcha, is not a way to find one.
 */
export const SECOND_FACTOR_MAX_ATTEMPTS = 5;

/**
 * How many wrong codes of the app, in a row and across challenges, lock the
 * codes of the app for `SECOND_FACTOR_LOCK_MS`. The count per challenge above
 * stops a typo from costing a password; this one is what stops somebody who
 * has the password and a captcha-solving service from making a fresh
 * challenge for every five guesses. After a lock the count starts again, so
 * the most a guesser gets is `SECOND_FACTOR_MAX_FAILED_ATTEMPTS` tries a
 * quarter of an hour. Recovery codes are fifty random bits and are not held
 * back by it, which leaves the person a way in while it lasts.
 */
export const SECOND_FACTOR_MAX_FAILED_ATTEMPTS = 5;
export const SECOND_FACTOR_LOCK_MS = 15 * 60 * 1000;

/** Recovery codes made when it is turned on, and when they are made again. */
export const RECOVERY_CODE_COUNT = 10;

/** The name an authenticator app shows beside the code. */
export const SECOND_FACTOR_ISSUER_FALLBACK = 'Kometio';
