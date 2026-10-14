import type { User } from '@kometio/domain-core';
import type { EmailPort, VerificationTokenPort } from '@kometio/ports';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildInviteEmail } from '../emails/invite-email.template';
import { trySendEmail, type UndeliveredEmail } from '../emails/try-send-email';

// Longer than password-reset's 1h: accepting an invite isn't a
// time-sensitive security action, and an admin realistically expects a
// new collaborator to get to it within a normal work week, not an hour.
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface IssueInviteDeps extends EmailLanguageDeps {
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface IssueInviteInput {
  user: User;
  /** e.g. EDITOR_APP_URL — the link is `<base>/accept-invite?inviteToken=<token>`. */
  inviteUrlBase: string;
}

export interface IssuedInvite {
  /** The invitation, if the mail server did not take it: the link exists all the same. */
  undelivered: UndeliveredEmail[];
  /**
   * The link itself, when no mail server will carry it. It is then the
   * inviter's to pass on, and is written nowhere else: a log entry would keep
   * a link that signs in as the invitee for as long as the log is kept, where
   * the person who made it is looking at it now. `null` when an email was
   * sent (or tried): the invitee has it, and so does nobody else.
   */
  inviteLink: string | null;
}

/**
 * A fresh invitation link for a person waiting to join, and the way it gets to
 * them: the email, on a server that has a mail server, and the inviter's own
 * hands on one that has none. `inviteUser` and `resendInvite` are this with
 * a person made or found first.
 */
export async function issueInvite(
  deps: IssueInviteDeps,
  input: IssueInviteInput,
): Promise<IssuedInvite> {
  const { user } = input;
  const inviteToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'user-invite',
    INVITE_TTL_MS,
  );
  const inviteUrlBase = input.inviteUrlBase.replace(/\/$/, '');
  const inviteUrl = `${inviteUrlBase}/accept-invite?inviteToken=${inviteToken.token}`;

  if (!deps.emailPort.delivers) {
    return { undelivered: [], inviteLink: inviteUrl };
  }
  return {
    undelivered: await trySendEmail(deps.emailPort, {
      to: user.email,
      ...buildInviteEmail(await emailLanguageOfUser(deps, user), inviteUrl),
    }),
    inviteLink: null,
  };
}
