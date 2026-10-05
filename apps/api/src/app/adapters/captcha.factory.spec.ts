import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import {
  asAltchaChallenge,
  solvedToken,
} from '@kometio/altcha-captcha/testing';
import { TurnstileCaptchaAdapter } from '@kometio/turnstile-captcha';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { createCaptcha } from './captcha.factory';

const NO_TURNSTILE = {
  TURNSTILE_SITE_KEY: undefined,
  TURNSTILE_SECRET_KEY: undefined,
} as const;

/** What the widget sends: the challenge the deployment handed out, solved. */
async function solvedBy(
  captcha: ReturnType<typeof createCaptcha>,
): Promise<string> {
  if (captcha.challenges === null) throw new Error('no challenge to solve');
  return solvedToken(
    asAltchaChallenge(await captcha.challenges.createChallenge()),
  );
}

describe('createCaptcha', () => {
  it('uses Cloudflare Turnstile when the deployment has its keys, and has no challenge of its own to hand out', () => {
    const captcha = createCaptcha(
      testApiEnv({
        TURNSTILE_SITE_KEY: 'site-key',
        TURNSTILE_SECRET_KEY: 'secret-key',
      }),
    );

    expect(captcha.verifier).toBeInstanceOf(TurnstileCaptchaAdapter);
    expect(captcha.challenges).toBeNull();
  });

  it('uses the captcha built into Kometio when it has none, and the same one checks what it hands out', () => {
    const captcha = createCaptcha(testApiEnv(NO_TURNSTILE));

    expect(captcha.verifier).toBeInstanceOf(AltchaCaptchaAdapter);
    expect(captcha.challenges).toBe(captcha.verifier);
  });

  /*
   * A restart must not strand a visitor whose page was loaded just before it:
   * the secret comes from the deployment's own, not from something made at
   * start-up.
   */
  it('signs with a secret that is the deployment’s, so a challenge handed out before a restart is still good after it', async () => {
    const env = testApiEnv({
      ...NO_TURNSTILE,
      PREVIEW_TOKEN_SECRET: 'the-same-secret-0123456789abcdef-0123456789',
    });
    const token = await solvedBy(createCaptcha(env));

    expect(await createCaptcha(env).verifier.verify({ token })).toBe(true);
  });

  it('does not accept the solution of another deployment’s challenge', async () => {
    const token = await solvedBy(
      createCaptcha(
        testApiEnv({
          ...NO_TURNSTILE,
          PREVIEW_TOKEN_SECRET: 'another-deployment-0123456789abcdef-0123456',
        }),
      ),
    );

    const here = createCaptcha(
      testApiEnv({
        ...NO_TURNSTILE,
        PREVIEW_TOKEN_SECRET: 'this-deployment-0123456789abcdef-0123456789ab',
      }),
    );

    expect(await here.verifier.verify({ token })).toBe(false);
  });
});
