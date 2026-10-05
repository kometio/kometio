import { CappedMap, createChallenge, randomInt } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { deriveHmacKeySecret, verify } from 'altcha-lib/frameworks/shared';
import type {
  CaptchaChallenge,
  CaptchaChallengePort,
  CaptchaPort,
  CaptchaVerifyInput,
} from '@kometio/ports';

export interface AltchaCaptchaConfig {
  /**
   * What the challenges are signed with: whoever has it can make a solution
   * the server accepts, so it is a secret of the deployment, never a value
   * the browser sees. A second secret, for the derived keys, is made from it.
   */
  secret: string;
  /** How long a challenge can be solved and spent. Default: ten minutes. */
  ttlSeconds?: number;
  /** PBKDF2 iterations per attempt. Default: 2000 (see the doc comment). */
  cost?: number;
}

const ALGORITHM = 'PBKDF2/SHA-256';
const DEFAULT_COST = 2_000;
// A long contact form takes minutes to fill in, and the widget solves its
// challenge as the page loads, so the answer has to outlive the typing. The
// price of a long window is a solution that stays spendable for that long;
// each is spent once (`used`), so it is what a person needs, not more.
const DEFAULT_TTL_SECONDS = 10 * 60;
// The counter the solver has to find is drawn from this range, and the
// challenge is signed with the key it leads to, so checking a solution costs
// one HMAC and finding it costs about the middle of the range in attempts. With
// the default cost that is under a second on a computer and a few on a phone:
// real for a script that submits thousands of forms, unnoticed by a person
// whose widget solves it while they read the page.
const COUNTER_RANGE = { min: 2_000, max: 6_000 } as const;
// Solutions remembered as spent. Oldest out first: what matters is that a
// solution cannot be spent twice inside its window, and 10,000 spent in ten
// minutes is more than the rate limits let one deployment accept.
const REMEMBERED_SOLUTIONS = 10_000;

/**
 * A captcha that needs no account and no network: ALTCHA, a proof of work the
 * visitor's browser solves in the background (docs/adr/0103). It makes the
 * challenge (`CaptchaChallengePort`) and checks the solution (`CaptchaPort`),
 * so a deployment with no Cloudflare keys is not left with a captcha that
 * passes everything.
 *
 * What the library does and what this adds. The library signs a challenge,
 * with its expiry, and checks that a solution fits it. It does not stop the
 * same solution from being spent twice, unless it is given somewhere to
 * remember the ones it has accepted: this keeps them in memory, like the
 * rate limiter of the API does. A restart forgets them, and two instances
 * would not share them; both are accepted at the scale of one process, and a
 * forgotten solution is spendable only until its challenge expires.
 *
 * Like the Turnstile adapter, a missing or malformed token is a refusal
 * without a fuss, never an error thrown up the stack: whoever sent it is told
 * to try again.
 */
export class AltchaCaptchaAdapter implements CaptchaPort, CaptchaChallengePort {
  private readonly cost: number;
  private readonly ttlSeconds: number;
  private readonly used = new CappedMap<string, boolean>({
    maxSize: REMEMBERED_SOLUTIONS,
  });
  private keySecret: Promise<string> | null = null;

  constructor(private readonly config: AltchaCaptchaConfig) {
    this.cost = config.cost ?? DEFAULT_COST;
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async createChallenge(): Promise<CaptchaChallenge> {
    return createChallenge({
      algorithm: ALGORITHM,
      cost: this.cost,
      counter: randomInt(COUNTER_RANGE.max, COUNTER_RANGE.min),
      deriveKey,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1_000),
      hmacSignatureSecret: this.config.secret,
      hmacKeySignatureSecret: await this.derivedKeySecret(),
    });
  }

  async verify(input: CaptchaVerifyInput): Promise<boolean> {
    if (!input.token) {
      return false;
    }
    try {
      const { error } = await verify(
        input.token,
        deriveKey,
        this.config.secret,
        await this.derivedKeySecret(),
        this.used,
      );
      return error === null;
    } catch {
      return false;
    }
  }

  private derivedKeySecret(): Promise<string> {
    this.keySecret ??= deriveHmacKeySecret(this.config.secret);
    return this.keySecret;
  }
}
