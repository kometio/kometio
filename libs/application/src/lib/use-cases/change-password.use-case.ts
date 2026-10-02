import {
  IncorrectPasswordError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type { AuthPort, EmailPort, UserRepositoryPort } from '@kometio/ports';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildPasswordChangedEmail } from '../emails/sign-in-changed-emails.template';
import { trySendEmail, type UndeliveredEmail } from '../emails/try-send-email';

export interface ChangePasswordDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  emailPort: EmailPort;
}

export interface ChangePasswordInput {
  tenantId: string;
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** The session the change is made from — the one that stays signed in. */
  currentSessionToken: string;
  /** e.g. EDITOR_APP_URL — the notice links to `/login` under it. */
  editorUrlBase: string;
}

export interface ChangePasswordResult {
  /** Notices that did not go out: the password is changed all the same. */
  undeliveredNotices: UndeliveredEmail[];
}

/**
 * A signed-in person's own password, changed by giving the current one.
 *
 * Asking for the current password is what keeps a session left open on a
 * shared computer, or a stolen one, from taking the account over. Every
 * OTHER session ends: a person changes their password when they think
 * somebody else may have it, and that somebody must not stay signed in
 * with a session the change was supposed to cut off. The one they are
 * using stays, or the change would sign them out of the page they made it
 * on.
 *
 * The person is told by mail at their own address, which is how the real
 * owner finds out that somebody else did it. `saveCredentials`, not `save`: this must not put back a role or an
 * active flag an admin changed a moment ago.
 */
export async function changePassword(
  deps: ChangePasswordDeps,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) throw new UserNotFoundError(input.userId);

  const matches = await deps.authPort.verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!matches) throw new IncorrectPasswordError();

  user.changePasswordHash(await deps.authPort.hashPassword(input.newPassword));
  await deps.userRepository.saveCredentials(user);
  await deps.authPort.invalidateOtherSessionsForUser(
    user.id,
    user.tenantId,
    input.currentSessionToken,
  );

  const loginUrl = `${input.editorUrlBase.replace(/\/$/, '')}/login`;
  return {
    undeliveredNotices: await trySendEmail(deps.emailPort, {
      to: user.email,
      ...buildPasswordChangedEmail(
        await emailLanguageOfUser(deps, user),
        loginUrl,
      ),
    }),
  };
}
