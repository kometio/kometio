import { describe, expect, it } from 'vitest';
import { User } from '@kometio/domain-core';
import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import {
  FakeAuthPort,
  FakeCaptchaPort,
  FakeDeploymentLocale,
  FakeEmailPort,
  FakeVerificationTokenPort,
  InMemoryUserRepository,
} from '@kometio/testing';
import { confirmEmailChange } from './confirm-email-change.use-case';
import { changePassword } from './change-password.use-case';
import { inviteUser } from './invite-user.use-case';
import { requestEmailChange } from './request-email-change.use-case';
import { requestEmailVerification } from './request-email-verification.use-case';
import { requestPasswordReset } from './request-password-reset.use-case';
import { resendInvite } from './resend-invite.use-case';

/*
 * The language of every email the system sends to a person (docs/adr/0100):
 * the one they chose, and for somebody who has not, the site's. Each use
 * case is run twice over, since "it sends an email" is what the other
 * specs already say — what is asked here is in which language.
 */

const tenantId = 'tenant-1';
const URL_BASE = 'https://editor.example.com';

/** The subject each email has in each language: what tells them apart without reading the body. */
const SUBJECTS = {
  passwordReset: { it: 'Reimposta la tua password', en: 'Reset your password' },
  verification: {
    it: 'Verifica il tuo indirizzo email',
    en: 'Verify your email address',
  },
  invite: {
    it: 'Sei stato invitato su Kometio',
    en: 'You have been invited to Kometio',
  },
  emailChange: {
    it: 'Conferma il tuo nuovo indirizzo email',
    en: 'Confirm your new email address',
  },
  passwordChanged: {
    it: 'La tua password è stata cambiata',
    en: 'Your password was changed',
  },
  emailChanged: {
    it: 'Il tuo indirizzo di accesso è stato cambiato',
    en: 'Your sign-in address was changed',
  },
} as const;

async function world(person: {
  language: InterfaceLanguage | null;
  siteLocale: string | null;
  active?: boolean;
}) {
  const userRepository = new InMemoryUserRepository();
  const authPort = new FakeAuthPort();
  const user = User.create({
    id: 'user-1',
    tenantId,
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: await authPort.hashPassword('old-password'),
    role: 'admin',
    isActive: person.active ?? true,
    language: person.language ?? undefined,
  });
  await userRepository.add(user);
  return {
    userRepository,
    authPort,
    verificationTokenPort: new FakeVerificationTokenPort(),
    emailPort: new FakeEmailPort(),
    captchaPort: new FakeCaptchaPort(),
    deploymentLocale: new FakeDeploymentLocale(person.siteLocale),
    user,
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** What the person is sent by each thing they can do, and the mail it must produce. */
const SENDERS: readonly {
  name: keyof typeof SUBJECTS;
  inactive?: boolean;
  /** Runs it and answers the message that went out (the last one, for the flows that send two). */
  run: (deps: World) => Promise<EmailMessage>;
}[] = [
  {
    name: 'passwordReset',
    run: async (deps) => {
      await requestPasswordReset(deps, {
        tenantId,
        email: 'lele@example.com',
        resetUrlBase: URL_BASE,
        captchaToken: 'valid-token',
      });
      return only(deps);
    },
  },
  {
    name: 'verification',
    run: async (deps) => {
      await requestEmailVerification(deps, {
        tenantId,
        userId: 'user-1',
        verifyUrlBase: URL_BASE,
      });
      return only(deps);
    },
  },
  {
    name: 'invite',
    inactive: true,
    run: async (deps) => {
      await resendInvite(deps, {
        tenantId,
        userId: 'user-1',
        inviteUrlBase: URL_BASE,
      });
      return only(deps);
    },
  },
  {
    name: 'emailChange',
    run: async (deps) => {
      await requestEmailChange(deps, {
        tenantId,
        userId: 'user-1',
        newEmail: 'new@example.com',
        currentPassword: 'old-password',
        confirmUrlBase: URL_BASE,
      });
      return only(deps);
    },
  },
  {
    name: 'passwordChanged',
    run: async (deps) => {
      const session = await deps.authPort.createSession('user-1', tenantId);
      await changePassword(deps, {
        tenantId,
        userId: 'user-1',
        currentPassword: 'old-password',
        newPassword: 'new-password',
        currentSessionToken: session.token,
        editorUrlBase: URL_BASE,
      });
      return only(deps);
    },
  },
  {
    name: 'emailChanged',
    run: async (deps) => {
      const token = await deps.verificationTokenPort.createToken(
        'user-1',
        tenantId,
        'email-change',
        60_000,
        'new@example.com',
      );
      await confirmEmailChange(deps, {
        token: token.token,
        editorUrlBase: URL_BASE,
      });
      return only(deps);
    },
  },
];

function only(deps: World): EmailMessage {
  expect(deps.emailPort.sentEmails).toHaveLength(1);
  return deps.emailPort.sentEmails[0];
}

describe.each(SENDERS)('the $name email', ({ name, inactive, run }) => {
  it.each(['it', 'en'] as const)(
    'is written in %s for a person who chose it, whatever language the site is in',
    async (language) => {
      const other = language === 'it' ? 'en' : 'it';
      const deps = await world({
        language,
        siteLocale: other,
        active: !inactive,
      });

      const email = await run(deps);

      expect(email.subject).toBe(SUBJECTS[name][language]);
    },
  );

  it.each([
    ['it', 'it'],
    ['en', 'en'],
    // Neither a language the emails exist in, nor a site to ask.
    ['fr', 'en'],
    [null, 'en'],
  ] as const)(
    'follows the language of the site (%s) for a person who has not chosen: %s',
    async (siteLocale, expected) => {
      const deps = await world({
        language: null,
        siteLocale,
        active: !inactive,
      });

      const email = await run(deps);

      expect(email.subject).toBe(SUBJECTS[name][expected]);
    },
  );
});

describe('inviting someone in a language', () => {
  const invitation = {
    tenantId,
    email: 'nuovo@example.com',
    displayName: 'Nuovo Utente',
    role: 'editor',
    inviteUrlBase: URL_BASE,
  } as const;

  it('writes the invitation in the language the inviter chose, and keeps it as theirs', async () => {
    const deps = await world({ language: null, siteLocale: 'it' });
    deps.emailPort.sentEmails.length = 0;

    const invited = await inviteUser(deps, { ...invitation, language: 'en' });

    expect(only(deps).subject).toBe(SUBJECTS.invite.en);
    // Theirs from now on: what they are sent later is in it too.
    expect(invited.language).toBe('en');
    expect(
      (await deps.userRepository.findById(tenantId, invited.id))?.language,
    ).toBe('en');
  });

  it("follows the site when the inviter did not choose, without making the site's language theirs", async () => {
    const deps = await world({ language: null, siteLocale: 'en' });
    deps.emailPort.sentEmails.length = 0;

    const invited = await inviteUser(deps, invitation);

    expect(only(deps).subject).toBe(SUBJECTS.invite.en);
    // Not chosen, so not stored: if the site changes language, so do they.
    expect(invited.language).toBeNull();
  });
});
