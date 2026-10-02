import type { CaptchaPort, CaptchaVerifyInput } from '@kometio/ports';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileCaptchaConfig {
  secretKey: string;
}

/**
 * Cloudflare Turnstile — chosen over reCAPTCHA/hCaptcha for its GDPR
 * posture: it isn't a Google product, so it sidesteps the same
 * click-to-load consent question already solved for Maps/YouTube
 * (ConsentGatedEmbed.astro) rather than reopening it. A blank/expired
 * token (never sent at all) is treated as an automatic fail without a
 * network call — same short-circuit reasoning as an empty honeypot check,
 * just for a different signal.
 */
export class TurnstileCaptchaAdapter implements CaptchaPort {
  constructor(private readonly config: TurnstileCaptchaConfig) {}

  async verify(input: CaptchaVerifyInput): Promise<boolean> {
    if (!input.token) {
      return false;
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: this.config.secretKey,
        response: input.token,
        ...(input.remoteIp ? { remoteip: input.remoteIp } : {}),
      }),
    });

    if (!response.ok) {
      return false;
    }

    const result: unknown = await response.json();
    // Only a `success: true` from Cloudflare passes; anything else in the
    // answer — a different shape, a captured error page — is a refusal.
    return (
      typeof result === 'object' &&
      result !== null &&
      'success' in result &&
      result.success === true
    );
  }
}
