import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  captchaTokenFrom,
  solveChallenge,
  tokenFor,
} from './solve-captcha.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

// The library is the adapter's, which is the API's: what this tool solves is
// made, and what it answers is checked, by the same code the API runs.
const fromAdapter = createRequire(
  join(here, '../libs/adapters/altcha-captcha/package.json'),
);
const { createChallenge, randomInt } = fromAdapter('altcha-lib');
const { deriveKey } = fromAdapter('altcha-lib/algorithms/pbkdf2');
const { deriveHmacKeySecret, verify } = fromAdapter(
  'altcha-lib/frameworks/shared',
);

const SECRET = 'a-secret-of-the-deployment-0123456789abcdef';

/** A challenge made the way the adapter makes its own (altcha-captcha.adapter.ts), only cheaper. */
async function challengeLikeTheAdapter(algorithm = 'PBKDF2/SHA-256') {
  return createChallenge({
    algorithm,
    cost: 50,
    counter: randomInt(600, 200),
    deriveKey,
    expiresAt: new Date(Date.now() + 60_000),
    hmacSignatureSecret: SECRET,
    hmacKeySignatureSecret: await deriveHmacKeySecret(SECRET),
  });
}

async function verdict(token) {
  const { error } = await verify(
    token,
    deriveKey,
    SECRET,
    await deriveHmacKeySecret(SECRET),
  );
  return error;
}

describe('solve-captcha', () => {
  it('answers a challenge the way the library that checks it accepts', async () => {
    const token = tokenFor(await challengeLikeTheAdapter());

    assert.equal(await verdict(token), null);
  });

  for (const algorithm of ['PBKDF2/SHA-384', 'PBKDF2/SHA-512']) {
    it(`solves ${algorithm} too`, async () => {
      const token = tokenFor(await challengeLikeTheAdapter(algorithm));

      assert.equal(await verdict(token), null);
    });
  }

  it('finds a counter whose key carries the challenge prefix', async () => {
    const challenge = await challengeLikeTheAdapter();

    const { counter, derivedKey } = solveChallenge(challenge);

    assert.ok(Number.isInteger(counter));
    assert.ok(derivedKey.startsWith(challenge.parameters.keyPrefix));
  });

  it('is refused by the library when the challenge was changed after it was signed', async () => {
    const challenge = await challengeLikeTheAdapter();
    challenge.parameters.keyPrefix = '00';
    const token = tokenFor(challenge);

    assert.notEqual(await verdict(token), null);
  });

  it('refuses an algorithm it does not know, and a prefix that matches everything', async () => {
    const challenge = await challengeLikeTheAdapter();

    assert.throws(
      () =>
        solveChallenge({
          ...challenge,
          parameters: { ...challenge.parameters, algorithm: 'SCRYPT' },
        }),
      /can solve/,
    );
    assert.throws(
      () =>
        solveChallenge({
          ...challenge,
          parameters: { ...challenge.parameters, keyPrefix: '' },
        }),
      /key prefix/,
    );
  });

  describe('against an API', () => {
    async function withApi(handler, use) {
      const requests = [];
      const server = createServer((request, response) => {
        requests.push(request.url);
        handler(response);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        return await use(`http://127.0.0.1:${server.address().port}`, requests);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }

    it('asks for a challenge and solves it, with or without a slash at the end of the address', async () => {
      const challenge = await challengeLikeTheAdapter();
      const answer = (response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(challenge));
      };

      await withApi(answer, async (origin, requests) => {
        for (const apiUrl of [`${origin}/api`, `${origin}/api/`]) {
          const token = await captchaTokenFrom(apiUrl);
          assert.equal(await verdict(token), null);
        }
        assert.deepEqual(requests, [
          '/api/captcha/challenge',
          '/api/captcha/challenge',
        ]);
      });
    });

    it('says which address answered with what, when there is no challenge', async () => {
      const refuse = (response) => {
        response.statusCode = 429;
        response.end();
      };

      await withApi(refuse, async (origin) => {
        await assert.rejects(
          captchaTokenFrom(`${origin}/api`),
          /captcha\/challenge answered 429/,
        );
      });
    });

    it('prints the token when run from a shell', async () => {
      const challenge = await challengeLikeTheAdapter();
      const answer = (response) => response.end(JSON.stringify(challenge));

      await withApi(answer, async (origin) => {
        const { stdout } = await run(process.execPath, [
          join(here, 'solve-captcha.mjs'),
          `${origin}/api`,
        ]);

        assert.equal(await verdict(stdout.trim()), null);
      });
    });
  });
});
