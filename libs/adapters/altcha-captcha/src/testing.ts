import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import type { CaptchaChallenge } from '@kometio/ports';

/**
 * Helpers for a test that needs to answer a challenge the way the widget does,
 * without a browser. They live here, next to the adapter that made the
 * challenge, so that a spec elsewhere does not have to depend on the library
 * and know its payload.
 */

/** The two members of the library's type that a challenge cannot be solved or checked without. */
function isAltchaChallenge(value: object): value is Challenge {
  return (
    'parameters' in value &&
    typeof value.parameters === 'object' &&
    value.parameters !== null &&
    'signature' in value &&
    typeof value.signature === 'string'
  );
}

/**
 * The port hands out a challenge nobody but the widget looks inside. This is
 * the one place that says what this adapter's is, and fails if it is not.
 */
export function asAltchaChallenge(challenge: CaptchaChallenge): Challenge {
  if (isAltchaChallenge(challenge)) return challenge;
  throw new Error('Not a challenge made by the ALTCHA adapter');
}

/**
 * What the widget submits with a form once it has solved `challenge`: the
 * challenge and its solution, as base64 JSON — the `token` of
 * `CaptchaPort.verify`.
 */
export async function solvedToken(challenge: Challenge): Promise<string> {
  const solution = await solveChallenge({ challenge, deriveKey });
  return Buffer.from(JSON.stringify({ challenge, solution })).toString(
    'base64',
  );
}
