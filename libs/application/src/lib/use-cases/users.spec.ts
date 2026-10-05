import { describe, expect, it } from 'vitest';
import {
  CannotChangeYourOwnAccessError,
  InvalidOrExpiredTokenError,
  InviteNotPendingError,
  InvitePendingError,
  LastActiveAdminError,
  User,
  UserAlreadyActiveError,
  UserEmailAlreadyExistsError,
  UserNotFoundError,
} from '@kometio/domain-core';
import { inviteUser } from './invite-user.use-case';
import { resendInvite } from './resend-invite.use-case';
import { cancelInvite } from './cancel-invite.use-case';
import { acceptInvite } from './accept-invite.use-case';
import { updateUserRole } from './update-user-role.use-case';
import { setUserActive } from './set-user-active.use-case';
import { listUsers } from './list-users.use-case';
import { InMemoryUserRepository } from '@kometio/testing';
import { FakeVerificationTokenPort } from '@kometio/testing';
import { FakeEmailPort } from '@kometio/testing';
import { FakeAuthPort } from '@kometio/testing';
import { FakeDeploymentLocale } from '@kometio/testing';

const tenantId = 'tenant-1';

function setup() {
  const userRepository = new InMemoryUserRepository();
  const verificationTokenPort = new FakeVerificationTokenPort();
  const emailPort = new FakeEmailPort();
  const authPort = new FakeAuthPort();
  return {
    userRepository,
    verificationTokenPort,
    emailPort,
    authPort,
    deploymentLocale: new FakeDeploymentLocale(),
  };
}

describe('inviteUser', () => {
  it('creates an inactive user and emails an accept-invite link', async () => {
    const deps = setup();

    const { user } = await inviteUser(deps, {
      tenantId,
      email: 'nuovo@example.com',
      displayName: 'Nuovo Utente',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com/',
    });

    expect(user.isActive).toBe(false);
    // Waiting to join, which is not the same as switched off.
    expect(user.invitePending).toBe(true);
    expect(user.role).toBe('editor');
    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('nuovo@example.com');
    expect(deps.emailPort.sentEmails[0].html).toContain(
      'https://editor.example.com/accept-invite?inviteToken=',
    );
    const saved = await deps.userRepository.findById(tenantId, user.id);
    expect(saved).not.toBeNull();
  });

  /*
   * The invitation used to throw when the mail server did, after the person
   * and the token were already written: the administrator saw an error, the
   * person was in the list waiting, and a second try was refused because the
   * address was taken. It is the person who is made; the email is reported.
   */
  it('still invites when the mail server is down, and reports the email that did not go out', async () => {
    const deps = setup();
    const failure = new Error('connect ECONNREFUSED');
    deps.emailPort.failEverySendWith(failure);

    const { user, undelivered } = await inviteUser(deps, {
      tenantId,
      email: 'nuovo@example.com',
      displayName: 'Nuovo Utente',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com/',
    });

    expect(undelivered).toEqual([{ to: 'nuovo@example.com', reason: failure }]);
    const saved = await deps.userRepository.findById(tenantId, user.id);
    expect(saved?.invitePending).toBe(true);
  });

  it('reports nothing undelivered when the email went out', async () => {
    const deps = setup();

    const { undelivered } = await inviteUser(deps, {
      tenantId,
      email: 'nuovo@example.com',
      displayName: 'Nuovo Utente',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com/',
    });

    expect(undelivered).toEqual([]);
  });

  it('throws UserEmailAlreadyExistsError for an email already in use, sending no email', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'user-1',
        tenantId,
        email: 'esiste@example.com',
        displayName: 'Esistente',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );

    await expect(
      inviteUser(deps, {
        tenantId,
        email: 'esiste@example.com',
        displayName: 'Duplicato',
        role: 'editor',
        inviteUrlBase: 'https://editor.example.com/',
      }),
    ).rejects.toThrow(UserEmailAlreadyExistsError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('counts an address written in another case as the same one', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'user-1',
        tenantId,
        email: 'Esiste@Example.com',
        displayName: 'Esistente',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );

    await expect(
      inviteUser(deps, {
        tenantId,
        email: 'esiste@example.com',
        displayName: 'Duplicato',
        role: 'editor',
        inviteUrlBase: 'https://editor.example.com/',
      }),
    ).rejects.toThrow(UserEmailAlreadyExistsError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });
});

describe('resendInvite', () => {
  it('reports the email that did not go out instead of failing, when the mail server is down', async () => {
    const deps = setup();
    const { user } = await inviteUser(deps, {
      tenantId,
      email: 'in-attesa@example.com',
      displayName: 'In Attesa',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com/',
    });
    const failure = new Error('connect ECONNREFUSED');
    deps.emailPort.failEverySendWith(failure);

    const { undelivered } = await resendInvite(deps, {
      tenantId,
      userId: user.id,
      inviteUrlBase: 'https://editor.example.com/',
    });

    expect(undelivered).toEqual([
      { to: 'in-attesa@example.com', reason: failure },
    ]);
  });

  it('mints a fresh invite token and re-sends the email for a pending user', async () => {
    const deps = setup();
    const { user } = await inviteUser(deps, {
      tenantId,
      email: 'in-attesa@example.com',
      displayName: 'In Attesa',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com/',
    });
    deps.emailPort.sentEmails.length = 0; // clear the original invite's email

    await resendInvite(deps, {
      tenantId,
      userId: user.id,
      inviteUrlBase: 'https://editor.example.com/',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('in-attesa@example.com');
    expect(deps.emailPort.sentEmails[0].html).toContain(
      'https://editor.example.com/accept-invite?inviteToken=',
    );
  });

  it('throws UserAlreadyActiveError for a user that already accepted', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'user-1',
        tenantId,
        email: 'attivo@example.com',
        displayName: 'Attivo',
        passwordHash: 'irrelevant',
        role: 'editor',
        isActive: true,
      }),
    );

    await expect(
      resendInvite(deps, {
        tenantId,
        userId: 'user-1',
        inviteUrlBase: 'https://editor.example.com/',
      }),
    ).rejects.toThrow(UserAlreadyActiveError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('throws UserNotFoundError for a user that does not exist', async () => {
    const deps = setup();

    await expect(
      resendInvite(deps, {
        tenantId,
        userId: 'does-not-exist',
        inviteUrlBase: 'https://editor.example.com/',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});

describe('cancelInvite', () => {
  const invitee = (over: Partial<Parameters<typeof User.create>[0]> = {}) =>
    User.create({
      id: 'invitee',
      tenantId,
      email: 'nuovo@example.com',
      displayName: 'Nuovo',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
      ...over,
    });

  it('removes somebody who has not accepted, and the email can be invited again', async () => {
    const deps = setup();
    await deps.userRepository.add(invitee());

    await cancelInvite(deps, { tenantId, userId: 'invitee' });

    expect(await deps.userRepository.findById(tenantId, 'invitee')).toBeNull();
    const { user: again } = await inviteUser(deps, {
      tenantId,
      email: 'nuovo@example.com',
      displayName: 'Nuovo',
      role: 'editor',
      inviteUrlBase: 'https://editor.example.com',
    });
    expect(again.invitePending).toBe(true);
  });

  it('refuses somebody who accepted: they are a user, and cancelling is not removing users', async () => {
    const deps = setup();
    await deps.userRepository.add(
      invitee({ isActive: true, invitePending: false }),
    );

    await expect(
      cancelInvite(deps, { tenantId, userId: 'invitee' }),
    ).rejects.toThrow(InviteNotPendingError);
    expect(
      await deps.userRepository.findById(tenantId, 'invitee'),
    ).not.toBeNull();
  });

  it('refuses somebody an admin switched off, who is not waiting either', async () => {
    const deps = setup();
    await deps.userRepository.add(invitee({ invitePending: false }));

    await expect(
      cancelInvite(deps, { tenantId, userId: 'invitee' }),
    ).rejects.toThrow(InviteNotPendingError);
  });

  it('throws UserNotFoundError for a user that does not exist', async () => {
    const deps = setup();

    await expect(
      cancelInvite(deps, { tenantId, userId: 'nobody' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('is scoped to the tenant', async () => {
    const deps = setup();
    await deps.userRepository.add(invitee());

    await expect(
      cancelInvite(deps, { tenantId: 'another-tenant', userId: 'invitee' }),
    ).rejects.toThrow(UserNotFoundError);
    expect(
      await deps.userRepository.findById(tenantId, 'invitee'),
    ).not.toBeNull();
  });
});

describe('acceptInvite', () => {
  it('sets the new password and reactivates the user', async () => {
    const deps = setup();
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
    });
    await deps.userRepository.add(user);
    const token = await deps.verificationTokenPort.createToken(
      user.id,
      tenantId,
      'user-invite',
      1000 * 60,
    );

    await acceptInvite(deps, { token: token.token, password: 'new-password' });

    const saved = await deps.userRepository.findById(tenantId, user.id);
    expect(saved?.isActive).toBe(true);
    expect(saved?.invitePending).toBe(false);
    expect(
      await deps.authPort.verifyPassword(
        'new-password',
        saved?.passwordHash ?? '',
      ),
    ).toBe(true);
  });

  it('keeps a role an admin gave the invitee after the link was read', async () => {
    const deps = setup();
    await withActingAdmin(deps);
    const invitee = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
    });
    await deps.userRepository.add(invitee);
    const token = await deps.verificationTokenPort.createToken(
      invitee.id,
      tenantId,
      'user-invite',
      1000 * 60,
    );
    // The admin's change lands between the read and the write.
    deps.userRepository.afterTheNextReadOf('user-1', async () => {
      const current = await deps.userRepository.findById(tenantId, 'user-1');
      if (!current) throw new Error('the invitee is missing');
      current.changeRole('publisher');
      await deps.userRepository.saveAccess(current);
    });

    await acceptInvite(deps, { token: token.token, password: 'new-password' });

    const saved = await deps.userRepository.findById(tenantId, 'user-1');
    expect(saved?.role).toBe('publisher');
    expect(saved?.isActive).toBe(true);
  });

  it('refuses an invitation that was cancelled after the link was read, and brings nobody back', async () => {
    const deps = setup();
    const invitee = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
    });
    await deps.userRepository.add(invitee);
    const token = await deps.verificationTokenPort.createToken(
      invitee.id,
      tenantId,
      'user-invite',
      1000 * 60,
    );
    deps.userRepository.afterTheNextReadOf('user-1', async () => {
      await deps.userRepository.removePendingInvite(tenantId, 'user-1');
    });

    await expect(
      acceptInvite(deps, { token: token.token, password: 'new-password' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
    expect(await deps.userRepository.findById(tenantId, 'user-1')).toBeNull();
  });

  it('does not let a second invitation token reset the password of somebody who has accepted', async () => {
    const deps = setup();
    const invitee = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
    });
    await deps.userRepository.add(invitee);
    // A resend mints another token; both are valid until one is used.
    const first = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'user-invite',
      1000 * 60,
    );
    const second = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'user-invite',
      1000 * 60,
    );
    await acceptInvite(deps, { token: first.token, password: 'chosen' });

    await expect(
      acceptInvite(deps, { token: second.token, password: 'somebody-elses' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);

    const saved = await deps.userRepository.findById(tenantId, 'user-1');
    expect(
      await deps.authPort.verifyPassword('chosen', saved?.passwordHash ?? ''),
    ).toBe(true);
  });

  it('throws InvalidOrExpiredTokenError for an unknown token', async () => {
    const deps = setup();

    await expect(
      acceptInvite(deps, { token: 'not-a-real-token', password: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('throws InvalidOrExpiredTokenError for a token issued for a different purpose', async () => {
    const deps = setup();
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
    });
    await deps.userRepository.add(user);
    const token = await deps.verificationTokenPort.createToken(
      user.id,
      tenantId,
      'password-reset',
      1000 * 60,
    );

    await expect(
      acceptInvite(deps, { token: token.token, password: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('throws InvalidOrExpiredTokenError when the token references a user that no longer exists', async () => {
    const deps = setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-that-was-deleted',
      tenantId,
      'user-invite',
      1000 * 60,
    );

    await expect(
      acceptInvite(deps, { token: token.token, password: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('is single-use: consuming the same token twice fails the second time', async () => {
    const deps = setup();
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'invitato@example.com',
      displayName: 'Invitato',
      passwordHash: 'unguessable',
      role: 'editor',
      isActive: false,
      invitePending: true,
    });
    await deps.userRepository.add(user);
    const token = await deps.verificationTokenPort.createToken(
      user.id,
      tenantId,
      'user-invite',
      1000 * 60,
    );

    await acceptInvite(deps, { token: token.token, password: 'first' });

    await expect(
      acceptInvite(deps, { token: token.token, password: 'second' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });
});

/**
 * The admin making the change. A role or an account can only be changed by
 * an admin who can sign in, so a real site always has one besides the
 * person being changed; without it, every change here would be refused
 * as leaving the site with no admin.
 */
async function withActingAdmin(deps: ReturnType<typeof setup>) {
  await deps.userRepository.add(
    User.create({
      id: 'another-admin',
      tenantId,
      email: 'another-admin@example.com',
      displayName: 'Another admin',
      passwordHash: 'irrelevant',
      role: 'admin',
    }),
  );
}

describe('updateUserRole', () => {
  it('changes the role and persists it', async () => {
    const deps = setup();
    await withActingAdmin(deps);
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'lele@example.com',
      displayName: 'Lele',
      passwordHash: 'irrelevant',
      role: 'editor',
    });
    await deps.userRepository.add(user);

    const result = await updateUserRole(deps, {
      tenantId,
      userId: 'user-1',
      role: 'publisher',
      actorUserId: 'another-admin',
    });

    expect(result.role).toBe('publisher');
    const saved = await deps.userRepository.findById(tenantId, 'user-1');
    expect(saved?.role).toBe('publisher');
  });

  it('throws UserNotFoundError for a user that does not exist', async () => {
    const deps = setup();

    await expect(
      updateUserRole(deps, {
        tenantId,
        userId: 'does-not-exist',
        role: 'admin',
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});

describe('updateUserRole and the last administrator', () => {
  it('refuses to demote the last active administrator — the same lockout by another route', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'admin-1',
        tenantId,
        email: 'admin@example.com',
        displayName: 'Admin',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );

    await expect(
      updateUserRole(deps, {
        tenantId,
        userId: 'admin-1',
        role: 'editor',
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(LastActiveAdminError);
    const saved = await deps.userRepository.findById(tenantId, 'admin-1');
    expect(saved?.role).toBe('admin');
  });

  it('allows re-confirming the last administrator AS an administrator', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'admin-1',
        tenantId,
        email: 'admin@example.com',
        displayName: 'Admin',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );

    const result = await updateUserRole(deps, {
      tenantId,
      userId: 'admin-1',
      role: 'admin',
      actorUserId: 'another-admin',
    });

    expect(result.role).toBe('admin');
  });
});

describe('changing your own access', () => {
  /*
   * The way it actually happens: you are looking at the list of users,
   * your own row is one of them, and the switch is right there. It takes
   * effect at once, your sessions end with it, and the next thing the
   * screen says is that your session expired.
   */
  async function setupTwoAdmins(deps: ReturnType<typeof setup>) {
    for (const id of ['admin-me', 'admin-other']) {
      await deps.userRepository.add(
        User.create({
          id,
          tenantId,
          email: `${id}@example.com`,
          displayName: id,
          passwordHash: 'irrelevant',
          role: 'admin',
        }),
      );
    }
  }

  it('refuses to switch off your own account, even with other admins around', async () => {
    const deps = setup();
    await setupTwoAdmins(deps);

    await expect(
      setUserActive(deps, {
        tenantId,
        userId: 'admin-me',
        isActive: false,
        actorUserId: 'admin-me',
      }),
    ).rejects.toThrow(CannotChangeYourOwnAccessError);
    const saved = await deps.userRepository.findById(tenantId, 'admin-me');
    expect(saved?.isActive).toBe(true);
  });

  it('refuses to change your own role, even with other admins around', async () => {
    const deps = setup();
    await setupTwoAdmins(deps);

    await expect(
      updateUserRole(deps, {
        tenantId,
        userId: 'admin-me',
        role: 'editor',
        actorUserId: 'admin-me',
      }),
    ).rejects.toThrow(CannotChangeYourOwnAccessError);
    const saved = await deps.userRepository.findById(tenantId, 'admin-me');
    expect(saved?.role).toBe('admin');
  });

  it('lets another administrator do the same thing', async () => {
    const deps = setup();
    await setupTwoAdmins(deps);

    const result = await setUserActive(deps, {
      tenantId,
      userId: 'admin-me',
      isActive: false,
      actorUserId: 'admin-other',
    });

    expect(result.isActive).toBe(false);
  });

  it('is not tripped by a role change that changes nothing', async () => {
    const deps = setup();
    await setupTwoAdmins(deps);

    const result = await updateUserRole(deps, {
      tenantId,
      userId: 'admin-me',
      role: 'admin',
      actorUserId: 'admin-me',
    });

    expect(result.role).toBe('admin');
  });
});

describe('setUserActive', () => {
  async function setupActiveUser(deps: ReturnType<typeof setup>) {
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'lele@example.com',
      displayName: 'Lele',
      passwordHash: 'irrelevant',
      role: 'publisher',
    });
    await deps.userRepository.add(user);
    return user;
  }

  it('deactivates a user and invalidates its existing sessions', async () => {
    const deps = setup();
    await withActingAdmin(deps);
    await setupActiveUser(deps);
    const session = await deps.authPort.createSession('user-1', tenantId);

    const result = await setUserActive(deps, {
      tenantId,
      userId: 'user-1',
      isActive: false,
      actorUserId: 'another-admin',
    });

    expect(result.isActive).toBe(false);
    const saved = await deps.userRepository.findById(tenantId, 'user-1');
    expect(saved?.isActive).toBe(false);
    expect(await deps.authPort.validateSession(session.token)).toBeNull();
  });

  /*
   * The screen offers "deactivate" on every row, including the row of
   * the only administrator, and there is no way back in afterwards: an
   * editor cannot promote anybody, so recovery is an UPDATE on the
   * database.
   */
  it('refuses to switch off the last administrator who can still sign in', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'admin-1',
        tenantId,
        email: 'admin@example.com',
        displayName: 'Admin',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );

    await expect(
      setUserActive(deps, {
        tenantId,
        userId: 'admin-1',
        isActive: false,
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(LastActiveAdminError);
    const saved = await deps.userRepository.findById(tenantId, 'admin-1');
    expect(saved?.isActive).toBe(true);
  });

  it('allows switching off an administrator while another active one remains', async () => {
    const deps = setup();
    for (const id of ['admin-1', 'admin-2']) {
      await deps.userRepository.add(
        User.create({
          id,
          tenantId,
          email: `${id}@example.com`,
          displayName: id,
          passwordHash: 'irrelevant',
          role: 'admin',
        }),
      );
    }

    const result = await setUserActive(deps, {
      tenantId,
      userId: 'admin-1',
      isActive: false,
      actorUserId: 'another-admin',
    });

    expect(result.isActive).toBe(false);
  });

  it('counts only administrators who can sign in — an invited, never-accepted one does not hold the door open', async () => {
    const deps = setup();
    await deps.userRepository.add(
      User.create({
        id: 'admin-1',
        tenantId,
        email: 'admin@example.com',
        displayName: 'Admin',
        passwordHash: 'irrelevant',
        role: 'admin',
      }),
    );
    await deps.userRepository.add(
      User.create({
        id: 'admin-invited',
        tenantId,
        email: 'invited@example.com',
        displayName: 'Invited',
        passwordHash: 'irrelevant',
        role: 'admin',
        isActive: false,
      }),
    );

    await expect(
      setUserActive(deps, {
        tenantId,
        userId: 'admin-1',
        isActive: false,
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(LastActiveAdminError);
  });

  it('reactivates a user without touching sessions', async () => {
    const deps = setup();
    await withActingAdmin(deps);
    const user = User.create({
      id: 'user-1',
      tenantId,
      email: 'lele@example.com',
      displayName: 'Lele',
      passwordHash: 'irrelevant',
      role: 'publisher',
      isActive: false,
    });
    await deps.userRepository.add(user);

    const result = await setUserActive(deps, {
      tenantId,
      userId: 'user-1',
      isActive: true,
      actorUserId: 'another-admin',
    });

    expect(result.isActive).toBe(true);
  });

  it('will not switch on somebody who has not accepted their invitation', async () => {
    const deps = setup();
    await withActingAdmin(deps);
    await deps.userRepository.add(
      User.create({
        id: 'invitee',
        tenantId,
        email: 'nuovo@example.com',
        displayName: 'Nuovo',
        passwordHash: 'unguessable',
        role: 'editor',
        isActive: false,
        invitePending: true,
      }),
    );

    await expect(
      setUserActive(deps, {
        tenantId,
        userId: 'invitee',
        isActive: true,
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(InvitePendingError);
    expect(
      (await deps.userRepository.findById(tenantId, 'invitee'))?.isActive,
    ).toBe(false);
  });

  it('throws UserNotFoundError for a user that does not exist', async () => {
    const deps = setup();

    await expect(
      setUserActive(deps, {
        tenantId,
        userId: 'does-not-exist',
        isActive: false,
        actorUserId: 'another-admin',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});

describe('listUsers', () => {
  it('paginates users scoped to the tenant', async () => {
    const deps = setup();
    for (let i = 0; i < 3; i++) {
      await deps.userRepository.add(
        User.create({
          id: `user-${i}`,
          tenantId,
          email: `user-${i}@example.com`,
          displayName: `User ${i}`,
          passwordHash: 'irrelevant',
          role: 'editor',
        }),
      );
    }
    await deps.userRepository.add(
      User.create({
        id: 'other-tenant-user',
        tenantId: 'tenant-2',
        email: 'other@example.com',
        displayName: 'Other',
        passwordHash: 'irrelevant',
        role: 'editor',
      }),
    );

    const result = await listUsers(deps, {
      tenantId,
      page: 1,
      pageSize: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });
});
