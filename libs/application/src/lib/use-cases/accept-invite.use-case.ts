import { InvalidOrExpiredTokenError } from '@kometio/domain-core';
import type {
  AuthPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

export interface AcceptInviteDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  authPort: AuthPort;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
}

/** Same "consume the token, act on the user it points at" shape as resetPassword — sets a real password, ends the pending state and lets the person sign in. */
export async function acceptInvite(
  deps: AcceptInviteDeps,
  input: AcceptInviteInput,
): Promise<void> {
  const consumed = await deps.verificationTokenPort.consumeToken(
    input.token,
    'user-invite',
  );
  if (!consumed) {
    throw new InvalidOrExpiredTokenError();
  }

  const user = await deps.userRepository.findById(
    consumed.tenantId,
    consumed.userId,
  );
  if (!user) {
    throw new InvalidOrExpiredTokenError();
  }

  const passwordHash = await deps.authPort.hashPassword(input.password);
  user.changePasswordHash(passwordHash);
  user.acceptInvite();
  // Only the password and the accepted state, and only while the invitation
  // is still pending: a role an admin changed since the link was read stays,
  // and an invitation cancelled in the meantime is not brought back.
  const accepted = await deps.userRepository.saveInviteAccepted(user);
  if (!accepted) {
    throw new InvalidOrExpiredTokenError();
  }
}
