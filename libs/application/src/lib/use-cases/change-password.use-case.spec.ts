import { describe, expect, it } from 'vitest';
import {
  IncorrectPasswordError,
  User,
  UserNotFoundError,
} from '@kometio/domain-core';
import {
  FakeAuthPort,
  FakeDeploymentLocale,
  FakeEmailPort,
  InMemoryUserRepository,
} from '@kometio/testing';
import { changePassword } from './change-password.use-case';

const tenantId = 'tenant-1';

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const authPort = new FakeAuthPort();
  const emailPort = new FakeEmailPort();
  const user = User.create({
    id: 'user-1',
    tenantId,
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: await authPort.hashPassword('old-password'),
    role: 'admin',
  });
  await userRepository.add(user);
  const here = await authPort.createSession(user.id, tenantId);
  const elsewhere = await authPort.createSession(user.id, tenantId);
  return {
    userRepository,
    authPort,
    emailPort,
    deploymentLocale: new FakeDeploymentLocale(),
    user,
    here,
    elsewhere,
  };
}

/** The account as the repository holds it now — failing loudly if it is gone. */
async function storedUser(
  repository: InMemoryUserRepository,
  id = 'user-1',
): Promise<User> {
  const user = await repository.findById(tenantId, id);
  if (!user) throw new Error(`No user ${id} in the repository`);
  return user;
}

const input = (here: string) => ({
  tenantId,
  userId: 'user-1',
  currentPassword: 'old-password',
  newPassword: 'new-password',
  currentSessionToken: here,
  editorUrlBase: 'https://editor.example.com/',
});

describe('changePassword', () => {
  it('sets the new password, which then signs in and the old one no longer does', async () => {
    const deps = await setup();

    await changePassword(deps, input(deps.here.token));

    const stored = await storedUser(deps.userRepository);
    expect(
      await deps.authPort.verifyPassword('new-password', stored.passwordHash),
    ).toBe(true);
    expect(
      await deps.authPort.verifyPassword('old-password', stored.passwordHash),
    ).toBe(false);
  });

  it('ends every other session and keeps the one it was made from', async () => {
    const deps = await setup();

    await changePassword(deps, input(deps.here.token));

    expect(await deps.authPort.validateSession(deps.here.token)).not.toBeNull();
    expect(
      await deps.authPort.validateSession(deps.elsewhere.token),
    ).toBeNull();
  });

  it('tells the person by mail, at their own address, with a way to the sign-in page', async () => {
    const deps = await setup();

    const result = await changePassword(deps, input(deps.here.token));

    expect(result.undeliveredNotices).toEqual([]);
    expect(deps.emailPort.sentEmails).toHaveLength(1);
    const [notice] = deps.emailPort.sentEmails;
    expect(notice?.to).toBe('lele@example.com');
    expect(notice?.subject).toBe('La tua password è stata cambiata');
    expect(notice?.text).toContain('https://editor.example.com/login');
  });

  it('still changes the password when the notice cannot be sent, and says it did not go', async () => {
    const deps = await setup();
    const down = new Error('smtp is down');
    deps.emailPort.failEverySendWith(down);

    const result = await changePassword(deps, input(deps.here.token));

    expect(result.undeliveredNotices).toEqual([
      { to: 'lele@example.com', reason: down },
    ]);
    const stored = await storedUser(deps.userRepository);
    expect(
      await deps.authPort.verifyPassword('new-password', stored.passwordHash),
    ).toBe(true);
    expect(
      await deps.authPort.validateSession(deps.elsewhere.token),
    ).toBeNull();
  });

  it('refuses a wrong current password, changing and ending nothing', async () => {
    const deps = await setup();

    await expect(
      changePassword(deps, {
        ...input(deps.here.token),
        currentPassword: 'not-it',
      }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);

    const stored = await storedUser(deps.userRepository);
    expect(
      await deps.authPort.verifyPassword('old-password', stored.passwordHash),
    ).toBe(true);
    expect(
      await deps.authPort.validateSession(deps.elsewhere.token),
    ).not.toBeNull();
    // Nothing happened, so nobody is told that something did.
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('does not switch back on an account an admin switched off after it was read', async () => {
    const deps = await setup();
    // Somebody else has to stay an active admin for the switch-off to be allowed.
    await deps.userRepository.add(
      User.create({
        id: 'admin-2',
        tenantId,
        email: 'boss@example.com',
        displayName: 'Boss',
        passwordHash: 'x',
        role: 'admin',
      }),
    );
    const editor = User.create({
      id: 'editor-1',
      tenantId,
      email: 'ed@example.com',
      displayName: 'Ed',
      passwordHash: await deps.authPort.hashPassword('old-password'),
      role: 'editor',
    });
    await deps.userRepository.add(editor);
    const session = await deps.authPort.createSession('editor-1', tenantId);
    // The admin's switch-off lands between the read and the write.
    deps.userRepository.switchOffAfterTheNextReadOf('editor-1');

    await changePassword(deps, {
      ...input(session.token),
      userId: 'editor-1',
    });

    const stored = await deps.userRepository.findById(tenantId, 'editor-1');
    expect(stored?.isActive).toBe(false);
  });

  it('is not found for an account that does not exist', async () => {
    const deps = await setup();

    await expect(
      changePassword(deps, { ...input(deps.here.token), userId: 'nobody' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
