import type { CaptchaPort, CaptchaVerifyInput } from '@kometio/ports';

/** Treats any non-empty token as valid — mirrors how a real provider
 * rejects a blank/missing token without a network call, without needing
 * network access in unit tests. */
export class FakeCaptchaPort implements CaptchaPort {
  async verify(input: CaptchaVerifyInput): Promise<boolean> {
    return input.token.trim() !== '';
  }
}
