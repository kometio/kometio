export interface CaptchaVerifyInput {
  /** The client-side widget's response token, submitted alongside the form. */
  token: string;
  /** Passed through to the provider's verify call when available — not required for a valid check. */
  remoteIp?: string;
}

/** Implemented by @kometio/turnstile-captcha and @kometio/altcha-captcha. A `false` result means "reject the submission with a visible error", unlike the honeypot check (docs/adr/0015), which discards silently — a failed CAPTCHA can be a real visitor with an expired/blocked token, so they get a chance to retry instead of a fake success. */
export interface CaptchaPort {
  verify(input: CaptchaVerifyInput): Promise<boolean>;
}

/**
 * A challenge a client has to solve, for a captcha that is not run by somebody
 * else (docs/adr/0103). Opaque to everything but the widget that solves it and
 * the adapter that made it: what comes back from the widget is the `token` of
 * `CaptchaPort.verify`.
 */
export type CaptchaChallenge = object;

/**
 * The half of a captcha that Turnstile has no use for: the challenge is made
 * here, not by Cloudflare. Implemented by @kometio/altcha-captcha, which also
 * implements `CaptchaPort` for the solution; a deployment using Turnstile has
 * no such port.
 */
export interface CaptchaChallengePort {
  createChallenge(): Promise<CaptchaChallenge>;
}
