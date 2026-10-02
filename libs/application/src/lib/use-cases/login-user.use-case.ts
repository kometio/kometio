import {
  InvalidCaptchaError,
  InvalidCredentialsError,
  UserNotActiveError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  CaptchaPort,
  Session,
  UserRepositoryPort,
} from '@kometio/ports';

export interface LoginUserDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  captchaPort: CaptchaPort;
}

export interface LoginUserInput {
  tenantId: string;
  email: string;
  password: string;
  /** Cloudflare Turnstile's client-side widget token — security review 2026-08-24, point 13: credential stuffing distributed across many IPs has no second line of defense without this. */
  captchaToken: string;
}

export async function loginUser(
  deps: LoginUserDeps,
  input: LoginUserInput,
): Promise<Session> {
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
    throw new InvalidCredentialsError();
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

  return deps.authPort.createSession(user.id, user.tenantId);
}
