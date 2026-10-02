import {
  EmailUnchangedError,
  IncorrectPasswordError,
  UserEmailAlreadyExistsError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import { buildEmailChangeEmail } from '../emails/email-change-email.template';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';

const EMAIL_CHANGE_TTL_MS = 1000 * 60 * 60 * 24; // 24h, like the verification of an address

export interface RequestEmailChangeDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface RequestEmailChangeInput {
  tenantId: string;
  userId: string;
  newEmail: string;
  /** Asked again, like a password change: an address is how somebody signs in and where a reset is sent. */
  currentPassword: string;
  /** e.g. EDITOR_APP_URL — the use-case appends `/confirm-email-change?changeToken=<token>`. */
  confirmUrlBase: string;
}

/**
 * Starts moving a person to another address: a link goes to the NEW one,
 * and nothing changes until it is followed.
 *
 * The link is what proves the address is theirs and readable — without it,
 * one typo would send every reset and every notice to a stranger, and a
 * session left open could hand the account over. The token carries the
 * address it was sent to (`payload`), so it can confirm that address and
 * no other, whatever is asked for afterwards.
 *
 * Saying an address is already taken tells a person who has just proved
 * their password that somebody has it: this is a team's editor, where the
 * users list already shows every address to an admin, and a form that
 * silently did nothing would leave the person waiting for a mail that will
 * never come.
 */
export async function requestEmailChange(
  deps: RequestEmailChangeDeps,
  input: RequestEmailChangeInput,
): Promise<void> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) throw new UserNotFoundError(input.userId);

  const matches = await deps.authPort.verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!matches) throw new IncorrectPasswordError();

  if (input.newEmail === user.email) throw new EmailUnchangedError();
  // Looked up without case, so the account itself is found for the address
  // written another way — changing `lele@x.it` to `Lele@x.it` is a change,
  // and what is refused is an address some OTHER account has.
  const holder = await deps.userRepository.findByEmail(
    input.tenantId,
    input.newEmail,
  );
  if (holder && holder.id !== user.id) {
    throw new UserEmailAlreadyExistsError(input.newEmail);
  }

  const changeToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'email-change',
    EMAIL_CHANGE_TTL_MS,
    input.newEmail,
  );
  const confirmUrlBase = input.confirmUrlBase.replace(/\/$/, '');
  const confirmUrl = `${confirmUrlBase}/confirm-email-change?changeToken=${changeToken.token}`;

  await deps.emailPort.sendEmail({
    to: input.newEmail,
    // In the language of the person, not of the address it goes to: the
    // address is new, the person who asked for it is not.
    ...buildEmailChangeEmail(await emailLanguageOfUser(deps, user), confirmUrl),
  });
}
