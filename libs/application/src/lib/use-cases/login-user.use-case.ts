import {
  InvalidCaptchaError,
  InvalidCredentialsError,
  UserNotActiveError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  CaptchaPort,
  SecondFactorRepositoryPort,
  Session,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import { describeDevice } from '../sessions/describe-device';
import { SECOND_FACTOR_CHALLENGE_TTL_MS } from './second-factor-policy';

export interface LoginUserDeps {
  userRepository: Pick<UserRepositoryPort, 'findByEmail'>;
  authPort: Pick<AuthPort, 'verifyPassword' | 'createSession'>;
  captchaPort: CaptchaPort;
  secondFactorRepository: Pick<SecondFactorRepositoryPort, 'findTotp'>;
  verificationTokenPort: Pick<VerificationTokenPort, 'createToken'>;
}

/**
 * What a right password leads to: a session, or — for a person who has
 * switched the second step on — a challenge to answer with a code
 * (`completeSecondFactorLogin`). No session exists until it is answered.
 */
export type LoginOutcome =
  | { status: 'signed-in'; session: Session }
  | { status: 'second-factor-required'; challenge: string };

export interface LoginUserInput {
  tenantId: string;
  email: string;
  password: string;
  /** Cloudflare Turnstile's client-side widget token — security review 2026-08-24, point 13: credential stuffing distributed across many IPs has no second line of defense without this. */
  captchaToken: string;
  /** The `User-Agent` the sign-in came with: only the label made of it is kept (docs/adr/0129). */
  userAgent?: string;
}

export async function loginUser(
  deps: LoginUserDeps,
  input: LoginUserInput,
): Promise<LoginOutcome> {
  // Checked before the DB lookup, same reasoning as submitForm: a failed
  // check costs nothing beyond the Turnstile API call, no point spending
  // a query on an attempt that's rejected either way.
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
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await deps.authPort.verifyPassword(
    input.password,
    user.passwordHash,
  );
  if (!passwordMatches) {
    // Which account it was a try at, for the activity log: the answer is the
    // same one an unknown address gets.
    throw new InvalidCredentialsError(user.id);
  }

  // Checked after the password, not before: a deactivated account should
  // never be distinguishable from a wrong password to someone who doesn't
  // already know the correct one (same anti-enumeration reasoning as
  // InvalidCredentialsError above). See RolesGuard for the complementary
  // half — it re-checks isActive on every already-authenticated request,
  // this closes the gap for controllers with no @Roles() declared at all
  // (security review 2026-08-25).
  if (!user.isActive) {
    throw new UserNotActiveError(user.id);
  }

  // Asked only after everything above, and only of a person who switched it
  // on: nothing about the second step is told to someone who has not got the
  // password. The challenge says who is being asked, in the database, and
  // goes in five minutes.
  const factor = await deps.secondFactorRepository.findTotp(
    user.tenantId,
    user.id,
  );
  if (factor?.confirmedAt) {
    const challenge = await deps.verificationTokenPort.createToken(
      user.id,
      user.tenantId,
      'second-factor',
      SECOND_FACTOR_CHALLENGE_TTL_MS,
      '0',
    );
    return { status: 'second-factor-required', challenge: challenge.token };
  }

  return {
    status: 'signed-in',
    session: await deps.authPort.createSession(user.id, user.tenantId, {
      label: describeDevice(input.userAgent),
    }),
  };
}
