import {
  InvalidOrExpiredTokenError,
  UserEmailAlreadyExistsError,
} from '@kometio/domain-core';
import type {
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildEmailChangedEmail } from '../emails/sign-in-changed-emails.template';
import { trySendEmail, type UndeliveredEmail } from '../emails/try-send-email';

export interface ConfirmEmailChangeDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface ConfirmEmailChangeInput {
  token: string;
  /** e.g. EDITOR_APP_URL — the notice links to `/login` under it. */
  editorUrlBase: string;
}

export interface ConfirmEmailChangeResult {
  /** The notice to the address left behind, if it did not go out: the change is made all the same. */
  undeliveredNotices: UndeliveredEmail[];
}

/**
 * Follows the link `requestEmailChange` sent to the new address.
 *
 * The address is taken from the token, never from the request: a link
 * confirms the address it was sent to. It is checked again here, because
 * somebody else may have been given it in the day since — the database's
 * unique constraint is the last word if two confirm at the same moment.
 * The token is spent either way, so a refused one has to be asked for
 * again.
 *
 * The address the account is leaving is told, once it has been left: it is
 * the one inbox that can warn the real owner. Sessions are left alone: a sign-in is by the account, not by its
 * address, and the person is very likely still using the editor in
 * another tab.
 */
export async function confirmEmailChange(
  deps: ConfirmEmailChangeDeps,
  input: ConfirmEmailChangeInput,
): Promise<ConfirmEmailChangeResult> {
  const consumed = await deps.verificationTokenPort.consumeToken(
    input.token,
    'email-change',
  );
  if (!consumed?.payload) throw new InvalidOrExpiredTokenError();

  const user = await deps.userRepository.findById(
    consumed.tenantId,
    consumed.userId,
  );
  if (!user) throw new InvalidOrExpiredTokenError();

  const holder = await deps.userRepository.findByEmail(
    consumed.tenantId,
    consumed.payload,
  );
  if (holder && holder.id !== user.id) {
    throw new UserEmailAlreadyExistsError(consumed.payload);
  }

  const previousEmail = user.email;
  user.changeEmail(consumed.payload);
  await deps.userRepository.saveCredentials(user);

  // Nobody to tell when the address did not move (a link followed twice over
  // another route, or to the address already held).
  if (previousEmail === user.email) return { undeliveredNotices: [] };
  const loginUrl = `${input.editorUrlBase.replace(/\/$/, '')}/login`;
  return {
    undeliveredNotices: await trySendEmail(deps.emailPort, {
      to: previousEmail,
      ...buildEmailChangedEmail(
        await emailLanguageOfUser(deps, user),
        previousEmail,
        user.email,
        loginUrl,
      ),
    }),
  };
}
