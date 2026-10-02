import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildVerificationEmail } from '../emails/verification-email.template';
import type {
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export interface RequestEmailVerificationDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface RequestEmailVerificationInput {
  tenantId: string;
  userId: string;
  /** e.g. EDITOR_APP_URL — the use-case appends `/verify-email?verifyToken=<token>`. */
  verifyUrlBase: string;
}

export async function requestEmailVerification(
  deps: RequestEmailVerificationDeps,
  input: RequestEmailVerificationInput,
): Promise<void> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    // Only reachable if the user backing a still-valid session was deleted
    // moments ago — no delete-user feature exists yet, so this is purely
    // defensive against the possibly-null return type.
    return;
  }
  if (user.isEmailVerified) {
    return;
  }

  const verificationToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'email-verification',
    EMAIL_VERIFICATION_TTL_MS,
  );
  const verifyUrlBase = input.verifyUrlBase.replace(/\/$/, '');
  const verifyUrl = `${verifyUrlBase}/verify-email?verifyToken=${verificationToken.token}`;

  await deps.emailPort.sendEmail({
    to: user.email,
    ...buildVerificationEmail(await emailLanguageOfUser(deps, user), verifyUrl),
  });
}
