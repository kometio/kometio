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
      upload: jest.fn(),
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

      expect(answer).toEqual({ emailSent: false });
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
      });
    });
  });
});
