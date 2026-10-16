import { createHmac } from 'node:crypto';
import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import type { CaptchaChallengePort, CaptchaPort } from '@kometio/ports';
import type { ApiEnv } from '../../env-schema';

/** What answers the captcha of this deployment: a way to check a solution, and a way to ask for a challenge to solve. */
export interface DeploymentCaptcha {
  verifier: CaptchaPort;
  challenges: CaptchaChallengePort;
}

/**
 * The captcha of this deployment: the one built into Kometio (docs/adr/0103,
 * 0145), ALTCHA, a proof of work. There is no other: a captcha from an outside
 * company was a second account to make before the first run, a script from the
 * internet on every login and every form, and a visitor's address handed to
 * somebody who is not a party to the site.
 *
 * It signs its challenges with a secret made from PREVIEW_TOKEN_SECRET, which
 * every deployment already has: a second secret to generate and keep would be
 * one more thing the first run asks for. It is a separate key (an HMAC of a
 * fixed label), so it is not the preview secret itself that signs a challenge.
 * It is stable across restarts, so a challenge handed out just before one can
 * still be answered just after.
 */
export function createCaptcha(env: ApiEnv): DeploymentCaptcha {
  const builtIn = new AltchaCaptchaAdapter({
    secret: createHmac('sha256', env.PREVIEW_TOKEN_SECRET)
      .update('kometio-captcha-v1')
      .digest('hex'),
  });
  return { verifier: builtIn, challenges: builtIn };
}
