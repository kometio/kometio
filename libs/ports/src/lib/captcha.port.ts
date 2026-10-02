export interface CaptchaVerifyInput {
  /** The client-side widget's response token, submitted alongside the form. */
  token: string;
  /** Passed through to the provider's verify call when available — not required for a valid check. */
  remoteIp?: string;
}

/** Implemented by @kometio/turnstile-captcha. A `false` result means "reject the submission with a visible error", unlike the honeypot check (docs/adr/0015), which discards silently — a failed CAPTCHA can be a real visitor with an expired/blocked token, so they get a chance to retry instead of a fake success. */
export interface CaptchaPort {
  verify(input: CaptchaVerifyInput): Promise<boolean>;
}
