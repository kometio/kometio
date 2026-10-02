import { describe, expect, it } from 'vitest';
import {
  EmailUnchangedError,
  IncorrectPasswordError,
  InvalidOrExpiredTokenError,
  User,
  UserEmailAlreadyExistsError,
} from '@kometio/domain-core';
import {
  FakeAuthPort,
  FakeDeploymentLocale,
  FakeEmailPort,
  FakeVerificationTokenPort,
  InMemoryUserRepository,
} from '@kometio/testing';
import { confirmEmailChange } from './confirm-email-change.use-case';
import { requestEmailChange } from './request-email-change.use-case';

const tenantId = 'tenant-1';

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const authPort = new FakeAuthPort();
  const verificationTokenPort = new FakeVerificationTokenPort();
  const emailPort = new FakeEmailPort();
  await userRepository.add(
    User.create({
      id: 'user-1',
      tenantId,
      email: 'lele@example.com',
      displayName: 'Lele',
      passwordHash: await authPort.hashPassword('my-password'),
      role: 'admin',
    }),
  );
  await userRepository.add(
    User.create({
      id: 'user-2',
      tenantId,
      email: 'taken@example.com',
      displayName: 'Other',
      passwordHash: 'irrelevant',
      role: 'editor',
    }),
  );
  return {
    userRepository,
    authPort,
    verificationTokenPort,
    emailPort,
    deploymentLocale: new FakeDeploymentLocale(),
  };
}

const EDITOR_URL = 'https://editor.example.com/';

const request = {
  tenantId,
  userId: 'user-1',
  newEmail: 'new@example.com',
  currentPassword: 'my-password',
  confirmUrlBase: 'https://editor.example.com/',
};

/** The token out of the link the mail carries. */
function tokenIn(html: string): string {
  const match = /changeToken=([^"&\s]+)/.exec(html);
  if (!match?.[1]) throw new Error('no link in the mail');
  return match[1];
}

describe('requestEmailChange', () => {
  it('mails a working link to the NEW address and changes nothing yet', async () => {
    const deps = await setup();

    await requestEmailChange(deps, request);

    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('new@example.com');
    expect(deps.emailPort.sentEmails[0].html).toContain(
      'https://editor.example.com/confirm-email-change?changeToken=',
    );
    const stored = await deps.userRepository.findById(tenantId, 'user-1');
    expect(stored?.email).toBe('lele@example.com');
  });

  it('refuses a wrong current password, sending nothing', async () => {
    const deps = await setup();

    await expect(
      requestEmailChange(deps, { ...request, currentPassword: 'nope' }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('refuses the address the account already has', async () => {
    const deps = await setup();

    await expect(
      requestEmailChange(deps, { ...request, newEmail: 'lele@example.com' }),
    ).rejects.toBeInstanceOf(EmailUnchangedError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('refuses an address somebody else has', async () => {
    const deps = await setup();

    await expect(
      requestEmailChange(deps, { ...request, newEmail: 'taken@example.com' }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });
});

describe('requestEmailChange: an address is the same address in any case', () => {
  it('refuses an address somebody else has, written in another case', async () => {
    const deps = await setup();

    await expect(
      requestEmailChange(deps, { ...request, newEmail: 'TAKEN@Example.com' }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('lets a person change only the case of their own address — it is not "taken", it is theirs', async () => {
    const deps = await setup();

    await requestEmailChange(deps, {
      ...request,
      newEmail: 'Lele@example.com',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('Lele@example.com');
  });
});

describe('confirmEmailChange', () => {
  it('moves the account to the address the link was sent to, verified, and signs in with it', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);

    await confirmEmailChange(deps, {
      token: tokenIn(deps.emailPort.sentEmails[0].html),
      editorUrlBase: EDITOR_URL,
    });

    const stored = await deps.userRepository.findById(tenantId, 'user-1');
    expect(stored?.email).toBe('new@example.com');
    expect(stored?.isEmailVerified).toBe(true);
    expect(
      await deps.userRepository.findByEmail(tenantId, 'lele@example.com'),
    ).toBeNull();
  });

  it('tells the address the account leaves — the one inbox that can warn the real owner', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    // The mail to the NEW address is the first one; the notice comes after.
    const link = tokenIn(deps.emailPort.sentEmails[0].html);

    const result = await confirmEmailChange(deps, {
      token: link,
      editorUrlBase: EDITOR_URL,
    });

    expect(result.undeliveredNotices).toEqual([]);
    expect(deps.emailPort.sentEmails).toHaveLength(2);
    const notice = deps.emailPort.sentEmails[1];
    expect(notice.to).toBe('lele@example.com');
    expect(notice.subject).toBe('Il tuo indirizzo di accesso è stato cambiato');
    expect(notice.text).toContain('da lele@example.com a new@example.com');
    expect(notice.text).toContain('https://editor.example.com/login');
  });

  it('still changes the address when the notice cannot be sent, and says it did not go', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    const link = tokenIn(deps.emailPort.sentEmails[0].html);
    const down = new Error('smtp is down');
    deps.emailPort.failEverySendWith(down);

    const result = await confirmEmailChange(deps, {
      token: link,
      editorUrlBase: EDITOR_URL,
    });

    expect(result.undeliveredNotices).toEqual([
      { to: 'lele@example.com', reason: down },
    ]);
    const stored = await deps.userRepository.findById(tenantId, 'user-1');
    expect(stored?.email).toBe('new@example.com');
  });

  it('tells nobody when the link was refused', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    const link = tokenIn(deps.emailPort.sentEmails[0].html);
    await confirmEmailChange(deps, { token: link, editorUrlBase: EDITOR_URL });
    const before = deps.emailPort.sentEmails.length;

    await expect(
      confirmEmailChange(deps, { token: link, editorUrlBase: EDITOR_URL }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);

    expect(deps.emailPort.sentEmails).toHaveLength(before);
  });

  it('is single-use', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    const token = tokenIn(deps.emailPort.sentEmails[0].html);
    await confirmEmailChange(deps, { token, editorUrlBase: EDITOR_URL });

    await expect(
      confirmEmailChange(deps, { token, editorUrlBase: EDITOR_URL }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });

  it('a link confirms only the address it was sent to, whatever is asked for afterwards', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    await requestEmailChange(deps, {
      ...request,
      newEmail: 'later@example.com',
    });

    // The FIRST mail's link, followed after the second request.
    await confirmEmailChange(deps, {
      token: tokenIn(deps.emailPort.sentEmails[0].html),
      editorUrlBase: EDITOR_URL,
    });

    const stored = await deps.userRepository.findById(tenantId, 'user-1');
    expect(stored?.email).toBe('new@example.com');
  });

  it('refuses an address somebody took since it was asked for', async () => {
    const deps = await setup();
    await requestEmailChange(deps, request);
    await deps.userRepository.add(
      User.create({
        id: 'user-3',
        tenantId,
        email: 'new@example.com',
        displayName: 'Faster',
        passwordHash: 'irrelevant',
        role: 'editor',
      }),
    );

    await expect(
      confirmEmailChange(deps, {
        token: tokenIn(deps.emailPort.sentEmails[0].html),
        editorUrlBase: EDITOR_URL,
      }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
    const stored = await deps.userRepository.findById(tenantId, 'user-1');
    expect(stored?.email).toBe('lele@example.com');
  });

  it('refuses a token that was issued for something else', async () => {
    const deps = await setup();
    const reset = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'password-reset',
      60_000,
    );

    await expect(
      confirmEmailChange(deps, {
        token: reset.token,
        editorUrlBase: EDITOR_URL,
      }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });

  it('refuses an email-change token that carries no address', async () => {
    const deps = await setup();
    const bare = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'email-change',
      60_000,
    );

    await expect(
      confirmEmailChange(deps, {
        token: bare.token,
        editorUrlBase: EDITOR_URL,
      }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });
});
