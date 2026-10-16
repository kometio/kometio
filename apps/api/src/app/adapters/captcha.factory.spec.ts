import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import {
  asAltchaChallenge,
  solvedToken,
} from '@kometio/altcha-captcha/testing';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { createCaptcha } from './captcha.factory';

/** What the widget sends: the challenge the deployment handed out, solved. */
async function solvedBy(
  captcha: ReturnType<typeof createCaptcha>,
): Promise<string> {
  return solvedToken(
    asAltchaChallenge(await captcha.challenges.createChallenge()),
  );
}

describe('createCaptcha', () => {
  it('is the captcha built into Kometio, and the same one checks what it hands out', () => {
    const captcha = createCaptcha(testApiEnv());

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
      PREVIEW_TOKEN_SECRET: 'the-same-secret-0123456789abcdef-0123456789',
    });
    const token = await solvedBy(createCaptcha(env));

    expect(await createCaptcha(env).verifier.verify({ token })).toBe(true);
  });

  it('does not accept the solution of another deployment’s challenge', async () => {
    const token = await solvedBy(
      createCaptcha(
        testApiEnv({
          PREVIEW_TOKEN_SECRET: 'another-deployment-0123456789abcdef-0123456',
        }),
      ),
    );

    const here = createCaptcha(
      testApiEnv({
        PREVIEW_TOKEN_SECRET: 'this-deployment-0123456789abcdef-0123456789ab',
      }),
    );

    expect(await here.verifier.verify({ token })).toBe(false);
  });
});
