import { InvalidCaptchaError } from '@kometio/domain-core';
import { buildPasswordResetEmail } from '../emails/password-reset-email.template';
import { trySendEmail, type UndeliveredEmail } from '../emails/try-send-email';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import type {
  CaptchaPort,
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1h

export interface RequestPasswordResetDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
  captchaPort: CaptchaPort;
}

export interface RequestPasswordResetInput {
  tenantId: string;
  email: string;
  /** e.g. EDITOR_APP_URL — the use-case appends `/reset-password?resetToken=<token>`. */
  resetUrlBase: string;
  /** Cloudflare Turnstile's client-side widget token — security review 2026-08-24, point 13: without it, a single IP can stay under the per-IP rate limit while still mailing hundreds of reset emails per hour to one victim. */
  captchaToken: string;
}

/** What a reset request tells its caller: only what did not go out, for a log. */
export interface RequestPasswordResetOutcome {
  /**
   * Empty for an address with no account and for an email that left. For the
   * caller to LOG and never to show: a request answered differently for an
   * address that has an account is exactly what this use case exists not to do.
   */
  undelivered: UndeliveredEmail[];
}

/**
 * Always resolves once past the CAPTCHA check, whether or not the email
 * matches a real user — same anti-enumeration principle as loginUser's
 * InvalidCredentialsError: the caller must never be able to tell "no
 * account with that email" apart from "email sent". A failed CAPTCHA is
 * orthogonal to that — it's checked before any lookup, so it never leaks
 * whether the email exists.
 *
 * That includes a mail server that is down. The send is not allowed to throw:
 * a 500 for an address that has an account against a 204 for one that has not
 * would hand the answer to anyone who asks, and a deployment with a wrong
 * SMTP_HOST did exactly that. What did not go out is returned, for the log.
 * The time a known address takes (a lookup, a token, a send) still differs from
 * an unknown one's; that is not removed here.
 */
export async function requestPasswordReset(
  deps: RequestPasswordResetDeps,
  input: RequestPasswordResetInput,
): Promise<RequestPasswordResetOutcome> {
  const captchaValid = await deps.captchaPort.verify({
    token: input.captchaToken,
  });
  if (!captchaValid) {
    throw new InvalidCaptchaError();
  }

  const user = await deps.userRepository.findByEmail(
    input.tenantId,
    input.email,
  );
  if (!user) {
    return { undelivered: [] };
  }

  const resetToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'password-reset',
    PASSWORD_RESET_TTL_MS,
  );
  const resetUrlBase = input.resetUrlBase.replace(/\/$/, '');
  const resetUrl = `${resetUrlBase}/reset-password?resetToken=${resetToken.token}`;

  const undelivered = await trySendEmail(deps.emailPort, {
    to: user.email,
    ...buildPasswordResetEmail(await emailLanguageOfUser(deps, user), resetUrl),
  });
  return { undelivered };
}
