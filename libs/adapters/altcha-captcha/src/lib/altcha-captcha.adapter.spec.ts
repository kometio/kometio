import { afterEach, describe, expect, it, vi } from 'vitest';
import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { asAltchaChallenge, solvedToken } from '../testing';
import { AltchaCaptchaAdapter } from './altcha-captcha.adapter';

const SECRET = 'a-secret-of-the-deployment-0123456789abcdef';

// Cheap to solve: the cost is what makes a real challenge take a moment.
const adapter = (overrides: { secret?: string; ttlSeconds?: number } = {}) =>
  new AltchaCaptchaAdapter({ secret: SECRET, cost: 1, ...overrides });

const challengeOf = async (port: AltchaCaptchaAdapter): Promise<Challenge> =>
  asAltchaChallenge(await port.createChallenge());

/**
 * What the widget sends back in the form, solved: the challenge it was given and
 * its solution. `tamper` changes the challenge after it was solved and signed,
 * as a client that wanted an easier one would.
 */
async function solved(
  port: AltchaCaptchaAdapter,
  tamper: (challenge: Challenge) => void = () => undefined,
): Promise<string> {
  const token = await solvedToken(await challengeOf(port));
  const payload: { challenge: Challenge; solution: unknown } = JSON.parse(
    Buffer.from(token, 'base64').toString(),
  );
  tamper(payload.challenge);
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('AltchaCaptchaAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createChallenge', () => {
    it('makes a signed challenge that expires, and makes another each time', async () => {
      const port = adapter({ ttlSeconds: 600 });

      const first = await challengeOf(port);
      const second = await challengeOf(port);

      expect(first.parameters.algorithm).toBe('PBKDF2/SHA-256');
      expect(first.signature).toEqual(expect.any(String));
      expect(first.parameters.expiresAt).toBeGreaterThan(Date.now() / 1_000);
      expect(first.parameters.expiresAt).toBeLessThanOrEqual(
        Date.now() / 1_000 + 600,
      );
      expect(first.parameters.nonce).not.toBe(second.parameters.nonce);
    });

    it('can be sent as JSON: the widget fetches it', async () => {
      const challenge = await adapter().createChallenge();

      expect(JSON.parse(JSON.stringify(challenge))).toEqual(challenge);
    });
  });

  describe('verify', () => {
    it('accepts the solution of a challenge it made', async () => {
      const port = adapter();

      expect(await port.verify({ token: await solved(port) })).toBe(true);
    });

    /*
     * The library checks that a solution fits its challenge; nothing in the
     * challenge says it has been spent. Without the memory of the ones that
     * were, one solved challenge would pass every form of a bot for ten minutes.
     */
    it('accepts a solution once: spending it again is refused', async () => {
      const port = adapter();
      const token = await solved(port);

      expect(await port.verify({ token })).toBe(true);
      expect(await port.verify({ token })).toBe(false);
    });

    it('does not count a refused attempt as spending the solution', async () => {
      const port = adapter();
      const token = await solved(port);

      expect(await port.verify({ token: token.slice(0, -4) })).toBe(false);
      expect(await port.verify({ token })).toBe(true);
    });

    it('refuses the solution of a challenge another deployment made', async () => {
      const token = await solved(
        adapter({ secret: 'some-other-secret-0123456789' }),
      );

      expect(await adapter().verify({ token })).toBe(false);
    });

    it('refuses a challenge that was changed after it was signed, such as one made easier', async () => {
      const port = adapter();
      const token = await solved(port, (challenge) => {
        challenge.parameters.cost = 1;
        challenge.parameters.keyPrefix = '00';
        challenge.parameters.expiresAt = 4_102_444_800;
      });

      expect(await port.verify({ token })).toBe(false);
    });

    it('refuses a solution that is not the one the challenge asks for', async () => {
      const port = adapter();
      const challenge = await challengeOf(port);
      const solution = await solveChallenge({ challenge, deriveKey });
      const token = Buffer.from(
        JSON.stringify({
          challenge,
          solution: { ...solution, derivedKey: '00'.repeat(32) },
        }),
      ).toString('base64');

      expect(await port.verify({ token })).toBe(false);
    });

    it('refuses a solution once its challenge has expired', async () => {
      const port = adapter({ ttlSeconds: 60 });
      const token = await solved(port);

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 61_000);

      expect(await port.verify({ token })).toBe(false);
    });

    it.each([
      ['no token', ''],
      ['text that is not base64 JSON', 'not a token'],
      ['JSON that is not a payload', Buffer.from('{"a":1}').toString('base64')],
      [
        'a payload with no solution',
        Buffer.from('{"challenge":{}}').toString('base64'),
      ],
      [
        'a challenge with no parameters',
        Buffer.from('{"challenge":{},"solution":{}}').toString('base64'),
      ],
      ['null', Buffer.from('null').toString('base64')],
    ])('refuses %s, without throwing', async (_name, token) => {
      expect(await adapter().verify({ token })).toBe(false);
    });
  });
});
