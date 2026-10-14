import { Logger } from '@nestjs/common';
import {
  FakeAuthPort,
  FakeDeploymentLocale,
  FakeEmailPort,
  FakeVerificationTokenPort,
  InMemoryUserRepository,
} from '@kometio/testing';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';
import { UsersController } from './users.controller';
import type { UsersDeps } from './users.deps';

const tenantId = 'tenant-1';

function setup() {
  const emailPort = new FakeEmailPort();
  const deps: UsersDeps = {
    userRepository: new InMemoryUserRepository(),
    authPort: new FakeAuthPort(),
    verificationTokenPort: new FakeVerificationTokenPort(),
    emailPort,
    deploymentLocale: new FakeDeploymentLocale(),
    mediaStorage: {
      provider: 'local',
      put: jest.fn(),
      getUrl: (storageKey) => `/media/${storageKey}`,
      delete: jest.fn(),
    },
  };
  const controller = new UsersController(
    deps,
    testApiEnv({ EDITOR_APP_URL: 'https://editor.example.com' }),
    new UndeliveredEmailLog(),
  );
  return { controller, emailPort };
}

const invitation = {
  email: 'nuovo@example.com',
  displayName: 'Nuovo Utente',
  role: 'editor',
  language: 'en',
} as const;

describe('UsersController', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('invite', () => {
    it('says the email went out, and writes nothing to the log', async () => {
      const { controller } = setup();

      const answer = await controller.invite(tenantId, invitation);

      expect(answer.emailSent).toBe(true);
      expect(answer.user.invitePending).toBe(true);
      expect(logged).not.toHaveBeenCalled();
    });

    /*
     * A mail server that refuses the message used to make this a 500, with the
     * person already in the list and their address taken for the next try.
     */
    it('still invites when the mail server is down, says the email did not go out, and logs why', async () => {
      const { controller, emailPort } = setup();
      emailPort.failEverySendWith(new Error('connect ECONNREFUSED'));

      const answer = await controller.invite(tenantId, invitation);

      expect(answer.emailSent).toBe(false);
      expect(answer.user.email).toBe('nuovo@example.com');
      expect(answer.user.invitePending).toBe(true);
      expect(logged).toHaveBeenCalledWith(
        'Invitation: the email to nuovo@example.com was not sent',
        expect.stringContaining('ECONNREFUSED'),
      );
    });
  });

  describe('resend', () => {
    it('says the email did not go out when the mail server is down, as the invitation does', async () => {
      const { controller, emailPort } = setup();
      const { user } = await controller.invite(tenantId, invitation);
      emailPort.failEverySendWith(new Error('connect ECONNREFUSED'));

      const answer = await controller.resend(tenantId, user.id);

      expect(answer).toEqual({ emailSent: false, inviteLink: null });
      expect(logged).toHaveBeenCalledWith(
        'Invitation (sent again): the email to nuovo@example.com was not sent',
        expect.stringContaining('ECONNREFUSED'),
      );
    });

    it('says the email went out when it did', async () => {
      const { controller } = setup();
      const { user } = await controller.invite(tenantId, invitation);

      expect(await controller.resend(tenantId, user.id)).toEqual({
        emailSent: true,
        inviteLink: null,
      });
    });
  });

  /*
   * With no mail server the link is the administrator's, in the answer, and
   * the log is told only that it was made: a link that signs in as the invitee
   * would otherwise be kept for as long as the log is.
   */
  describe('on a server with no mail server', () => {
    let info: jest.SpyInstance;

    beforeEach(() => {
      info = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });

    afterEach(() => {
      info.mockRestore();
    });

    function setupWithoutMailServer() {
      const made = setup();
      made.emailPort.delivers = false;
      return made;
    }

    it('answers an invitation with the link, and keeps it out of the log', async () => {
      const { controller, emailPort } = setupWithoutMailServer();

      const answer = await controller.invite(tenantId, invitation);

      expect(answer.emailSent).toBe(true);
      expect(answer.inviteLink).toMatch(
        /^https:\/\/editor\.example\.com\/accept-invite\?inviteToken=.+/,
      );
      expect(emailPort.sentEmails).toEqual([]);
      const token = new URL(answer.inviteLink ?? '').searchParams.get(
        'inviteToken',
      );
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('nothing was sent to nuovo@example.com'),
      );
      expect(JSON.stringify(info.mock.calls)).not.toContain(token);
      expect(logged).not.toHaveBeenCalled();
    });

    it('answers sending it again with a new link, and keeps that out of the log too', async () => {
      const { controller } = setupWithoutMailServer();
      const { user, inviteLink: first } = await controller.invite(
        tenantId,
        invitation,
      );
      info.mockClear();

      const answer = await controller.resend(tenantId, user.id);

      expect(answer.inviteLink).toMatch(/\/accept-invite\?inviteToken=.+/);
      expect(answer.inviteLink).not.toBe(first);
      const token = new URL(answer.inviteLink ?? '').searchParams.get(
        'inviteToken',
      );
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('Invitation (sent again)'),
      );
      expect(JSON.stringify(info.mock.calls)).not.toContain(token);
    });
  });
});
