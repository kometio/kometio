import { createHmac } from 'node:crypto';
import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import type { CaptchaChallengePort, CaptchaPort } from '@kometio/ports';
import { TurnstileCaptchaAdapter } from '@kometio/turnstile-captcha';
import type { ApiEnv } from '../../env-schema';

/** What answers the captcha of this deployment: a way to check a solution, and, if it makes its own challenges, a way to ask for one. */
export interface DeploymentCaptcha {
  verifier: CaptchaPort;
  /** `null` when the challenge is somebody else's (Turnstile): there is none to hand out. */
  challenges: CaptchaChallengePort | null;
}

/**
 * Cloudflare Turnstile when the deployment has its keys (TURNSTILE_SITE_KEY and
 * TURNSTILE_SECRET_KEY, both, which the schema checks), and the captcha built
 * into Kometio when it has none (docs/adr/0103). One rule, the same for the
 * editor and the public site, which draw the widget for whichever one has its
 * public key.
 *
 * The built-in one signs its challenges with a secret made from
 * PREVIEW_TOKEN_SECRET, which every deployment already has: a second secret
 * to generate and keep would be one more thing the first run asks for. It is a
 * separate key (an HMAC of a fixed label), so it is not the preview secret
 * itself that signs a challenge. It is stable across restarts, so a challenge
 * handed out just before one can still be answered just after.
 */
export function createCaptcha(env: ApiEnv): DeploymentCaptcha {
  if (env.TURNSTILE_SECRET_KEY !== undefined) {
    return {
      verifier: new TurnstileCaptchaAdapter({
        secretKey: env.TURNSTILE_SECRET_KEY,
      }),
      challenges: null,
    };
  }
  const builtIn = new AltchaCaptchaAdapter({
    secret: createHmac('sha256', env.PREVIEW_TOKEN_SECRET)
      .update('kometio-captcha-v1')
      .digest('hex'),
  });
  return { verifier: builtIn, challenges: builtIn };
}
