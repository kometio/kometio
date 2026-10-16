#!/usr/bin/env node
import { pbkdf2Sync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/**
 * Answers the captcha built into Kometio (ALTCHA, docs/adr/0103) the way its
 * widget does, for what has no browser: a script that signs in to an image
 * through the API (docker/kometio/check.sh), and the end-to-end suite's login.
 *
 *   node tools/solve-captcha.mjs http://localhost:3000/api
 *
 * prints the token to send as `captchaToken` (or `_captcha` in a form).
 *
 * It depends on nothing but Node on purpose: check.sh --smoke-only runs on the
 * machine that publishes the image, where no `pnpm install` was done. What that
 * costs is a second copy of the proof of work (a page of the protocol, below);
 * tools/solve-captcha.test.mjs checks its answers with the library the API
 * checks them with, so a change in the protocol fails there, not in a release.
 */

const DIGESTS = {
  'PBKDF2/SHA-256': 'sha256',
  'PBKDF2/SHA-384': 'sha384',
  'PBKDF2/SHA-512': 'sha512',
};
const DEFAULT_KEY_LENGTH = 32;
const COUNTER_BYTES = 4;
// The API draws the counter it signs from 2,000–6,000. A challenge that is not
// found well past that is not one of ours, and is refused instead of spun on.
const MAX_ATTEMPTS = 100_000;

/**
 * The solution to a challenge: the first counter whose key starts with the
 * challenge's prefix. The password of each attempt is the challenge's nonce
 * followed by the counter as four big-endian bytes.
 */
export function solveChallenge(challenge) {
  const { algorithm, nonce, salt, cost, keyPrefix } = challenge.parameters;
  const keyLength = challenge.parameters.keyLength ?? DEFAULT_KEY_LENGTH;
  const digest = DIGESTS[algorithm];
  if (digest === undefined) {
    throw new Error(`Not a captcha this tool can solve: ${algorithm}`);
  }
  // An empty prefix is satisfied by counter 0: the server never signs one.
  if (!/^[0-9a-f]+$/i.test(keyPrefix)) {
    throw new Error('The challenge has no usable key prefix');
  }
  const prefix = keyPrefix.toLowerCase();
  const saltBytes = Buffer.from(salt, 'hex');
  const password = Buffer.concat([
    Buffer.from(nonce, 'hex'),
    Buffer.alloc(COUNTER_BYTES),
  ]);
  const started = performance.now();
  for (let counter = 0; counter <= MAX_ATTEMPTS; counter++) {
    password.writeUInt32BE(counter, password.length - COUNTER_BYTES);
    const derivedKey = pbkdf2Sync(
      password,
      saltBytes,
      cost,
      keyLength,
      digest,
    ).toString('hex');
    if (derivedKey.startsWith(prefix)) {
      return {
        counter,
        derivedKey,
        time: Math.floor(performance.now() - started),
      };
    }
  }
  throw new Error(`No solution in ${MAX_ATTEMPTS} attempts`);
}

/** What the widget submits: the challenge and its solution, as base64 JSON. */
export function tokenFor(challenge) {
  return Buffer.from(
    JSON.stringify({ challenge, solution: solveChallenge(challenge) }),
  ).toString('base64');
}

/**
 * Asks the API at `apiUrl` (the one ending in `/api`) for a challenge and
 * solves it. A token is spent once: ask for one per request that needs it.
 */
export async function captchaTokenFrom(apiUrl, fetchImplementation = fetch) {
  const url = `${apiUrl.replace(/\/+$/, '')}/captcha/challenge`;
  const response = await fetchImplementation(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return tokenFor(await response.json());
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const apiUrl = process.argv[2];
  if (apiUrl === undefined) {
    console.error('usage: node tools/solve-captcha.mjs API_URL');
    process.exit(2);
  }
  process.stdout.write(`${await captchaTokenFrom(apiUrl)}\n`);
}
