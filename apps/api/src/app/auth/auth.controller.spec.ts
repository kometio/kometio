import { Logger } from '@nestjs/common';
import {
  InvalidCaptchaError,
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  User,
  UserNotActiveError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  CaptchaPort,
  EmailPort,
  Session,
  UserRepositoryPort,
  VerificationToken,
  VerificationTokenPort,
} from '@kometio/ports';
import { InMemoryAuditLog } from '@kometio/testing';
import { DeploymentTenantResolver } from '../deployment-tenant.resolver';
import { AuthController } from './auth.controller';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { SESSION_COOKIE_NAME, SessionCookies } from './session-cookies';
import { AuditRecorder } from '../audit/audit-recorder';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';

const tenantId = 'tenant-1';

/** The deployment's tenant, already known: with DEFAULT_TENANT_ID set the directory is never asked. */
function resolvedTenant(id: string): DeploymentTenantResolver {
  return new DeploymentTenantResolver({ listIds: async () => [] }, id);
}
const editorAppUrl = 'https://editor.example.com';

/** What a cookie is written through, with the calls kept to be read back. */
function buildResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

/** The part of the request a logout reads. */
function fakeRequest(cookies: Record<string, string | undefined>) {
  return { cookies };
}

/** What a sign-in is read from: only the browser's own name for itself. */
function loginRequest(userAgent?: string) {
  return { headers: { 'user-agent': userAgent } };
}

describe('AuthController', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authPort: jest.Mocked<AuthPort>;
  let verificationTokenPort: jest.Mocked<VerificationTokenPort>;
  let emailPort: jest.Mocked<EmailPort>;
  let captchaPort: jest.Mocked<CaptchaPort>;
  let auditLog: InMemoryAuditLog;
  let controller: AuthController;

  beforeEach(() => {
    auditLog = new InMemoryAuditLog();
    userRepository = {
      add: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      list: jest.fn(),
      saveAccess: jest.fn(),
      removePendingInvite: jest.fn(),
      saveCredentials: jest.fn(),
      saveInviteAccepted: jest.fn(),
      saveLanguage: jest.fn(),
      findBySlug: jest.fn(),
      findByFormerSlug: jest.fn(),
      isSlugTaken: jest.fn(),
      saveProfile: jest.fn(),
      saveAvatar: jest.fn(),
    };
    authPort = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      createSession: jest.fn(),
      validateSession: jest.fn(),
      invalidateSession: jest.fn(),
      invalidateAllSessionsForUser: jest.fn(),
      invalidateOtherSessionsForUser: jest.fn(),
      listSessionsForUser: jest.fn(),
      invalidateSessionOfUser: jest.fn(),
    };
    verificationTokenPort = {
      createToken: jest.fn(),
      consumeToken: jest.fn(),
    };
    emailPort = {
      delivers: true,
      sendEmail: jest.fn(),
    };
    // Passes by default — the captcha-specific tests below override it.
    captchaPort = { verify: jest.fn().mockResolvedValue(true) };
    const env = testApiEnv({ EDITOR_APP_URL: editorAppUrl });
    controller = new AuthController(
      {
        userRepository,
        authPort,
        verificationTokenPort,
        emailPort,
        deploymentLocale: { defaultLocale: async () => 'it' },
        captchaPort,
        // The controller takes the resolver, not a raw id — a self-hosted
        // deployment does not know its tenant until the first-run wizard
        // creates one. Here it is always resolved, which is what every test
        // in this file assumes.
        tenant: resolvedTenant(tenantId),
      },
      env,
      new SessionCookies(env),
      new UndeliveredEmailLog(),
      new AuditRecorder(auditLog),
    );
  });

  describe('login', () => {
    it('sets a session cookie and returns the user id on success', async () => {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'lele@example.com',
        displayName: 'Lele',
        passwordHash: 'hashed',
        role: 'admin',
      });
      userRepository.findByEmail.mockResolvedValue(user);
      authPort.verifyPassword.mockResolvedValue(true);
      const session: Session = {
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        expiresAt: new Date(),
      };
      authPort.createSession.mockResolvedValue(session);
      const response = buildResponse();

      const result = await controller.login(
        {
          email: 'lele@example.com',
          password: 'correct',
          captchaToken: 'valid-token',
        },
        loginRequest(),
        response,
      );

      expect(result).toEqual({ userId: 'user-1' });
      expect(response.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'a-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
    });

    it('records what the sign-in came from as a label, not as the header', async () => {
      userRepository.findByEmail.mockResolvedValue(
        User.create({
          id: 'user-1',
          tenantId,
          email: 'lele@example.com',
          displayName: 'Lele',
          passwordHash: 'hash',
          role: 'admin',
          isActive: true,
        }),
      );
      authPort.verifyPassword.mockResolvedValue(true);
      authPort.createSession.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        expiresAt: new Date(),
      });

      await controller.login(
        {
          email: 'lele@example.com',
          password: 'correct',
          captchaToken: 'valid-token',
        },
        loginRequest(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        ),
        buildResponse(),
      );

      expect(authPort.createSession).toHaveBeenCalledWith('user-1', tenantId, {
        label: 'Safari on iPhone',
      });
    });

    it('lets InvalidCredentialsError through to the auth filter', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      const response = buildResponse();

      await expect(
        controller.login(
          {
            email: 'nobody@example.com',
            password: 'irrelevant',
            captchaToken: 'valid-token',
          },
          loginRequest(),
          response,
        ),
      ).rejects.toThrow(InvalidCredentialsError);
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('lets a deactivated account through as its own error, for the filter to answer like bad credentials', async () => {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'lele@example.com',
        displayName: 'Lele',
        passwordHash: 'hashed',
        role: 'admin',
        isActive: false,
      });
      userRepository.findByEmail.mockResolvedValue(user);
      authPort.verifyPassword.mockResolvedValue(true);
      const response = buildResponse();

      let caught: unknown;
      try {
        await controller.login(
          {
            email: 'lele@example.com',
            password: 'correct',
            captchaToken: 'valid-token',
          },
          loginRequest(),
          response,
        );
      } catch (error) {
        caught = error;
      }

      // The controller lets it through; AuthErrorsFilter answers it with
      // the same 401 as a wrong password (its own spec, and the HTTP one).
      expect(caught).toBeInstanceOf(UserNotActiveError);
      expect(authPort.createSession).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('lets unexpected errors propagate unchanged', async () => {
      userRepository.findByEmail.mockRejectedValue(new Error('db exploded'));
      const response = buildResponse();

      await expect(
        controller.login(
          {
            email: 'lele@example.com',
            password: 'irrelevant',
            captchaToken: 'valid-token',
          },
          loginRequest(),
          response,
        ),
      ).rejects.toThrow('db exploded');
    });

    it('refuses an invalid captcha before even looking up the account', async () => {
      captchaPort.verify.mockResolvedValue(false);
      const response = buildResponse();

      await expect(
        controller.login(
          {
            email: 'lele@example.com',
            password: 'correct',
            captchaToken: 'bad-token',
          },
          loginRequest(),
          response,
        ),
      ).rejects.toThrow(InvalidCaptchaError);
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('invalidates the session and clears the cookie when a session cookie is present', async () => {
      const request = fakeRequest({ [SESSION_COOKIE_NAME]: 'a-token' });
      const response = buildResponse();

      const result = await controller.logout(request, response);

      expect(authPort.invalidateSession).toHaveBeenCalledWith('a-token');
      expect(response.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('clears the cookie even when there is no session cookie to invalidate', async () => {
      const request = fakeRequest({});
      const response = buildResponse();

      await controller.logout(request, response);

      expect(authPort.invalidateSession).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
    });

    it('clears the cookie even when cookie-parser never ran (cookies is undefined)', async () => {
      const request = { cookies: undefined };
      const response = buildResponse();

      await controller.logout(request, response);

      expect(authPort.invalidateSession).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('sends a verification email for the authenticated user', async () => {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'lele@example.com',
        displayName: 'Lele',
        passwordHash: 'hashed',
        role: 'admin',
      });
      userRepository.findById.mockResolvedValue(user);
      const token: VerificationToken = {
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        purpose: 'email-verification',
        payload: null,
        expiresAt: new Date(),
      };
      verificationTokenPort.createToken.mockResolvedValue(token);

      const result = await controller.resendVerificationEmail(
        tenantId,
        'user-1',
      );

      expect(emailPort.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'lele@example.com' }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('confirmEmailVerification', () => {
    it('returns success when the token is valid', async () => {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'lele@example.com',
        displayName: 'Lele',
        passwordHash: 'hashed',
        role: 'admin',
      });
      verificationTokenPort.consumeToken.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        purpose: 'email-verification',
        payload: null,
        expiresAt: new Date(),
      });
      userRepository.findById.mockResolvedValue(user);

      const result = await controller.confirmEmailVerification({
        token: 'a-token',
      });

      expect(result).toEqual({ success: true });
    });

    it('lets InvalidOrExpiredTokenError through to the auth filter', async () => {
      verificationTokenPort.consumeToken.mockResolvedValue(null);

      await expect(
        controller.confirmEmailVerification({ token: 'bad-token' }),
      ).rejects.toThrow(InvalidOrExpiredTokenError);
    });

    it('lets unexpected errors propagate unchanged', async () => {
      verificationTokenPort.consumeToken.mockRejectedValue(
        new Error('db exploded'),
      );

      await expect(
        controller.confirmEmailVerification({ token: 'a-token' }),
      ).rejects.toThrow('db exploded');
    });
  });

  describe('requestPasswordReset', () => {
    it('always returns success, whether or not the email matches a user', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      const result = await controller.requestPasswordReset({
        email: 'nobody@example.com',
        captchaToken: 'valid-token',
      });

      expect(result).toEqual({ success: true });
      expect(emailPort.sendEmail).not.toHaveBeenCalled();
    });

    /*
     * With a mail server that is down, a known address used to answer 500 and
     * an unknown one 204: anyone could tell which addresses have an account.
     * It answers the same now, and the failure goes where the operator reads.
     */
    it('answers as it does for an unknown address when the mail server is down, and says so in the log', async () => {
      userRepository.findByEmail.mockResolvedValue(
        User.create({
          id: 'user-1',
          tenantId,
          email: 'lele@example.com',
          displayName: 'Lele',
          passwordHash: 'hashed',
          role: 'admin',
        }),
      );
      verificationTokenPort.createToken.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        purpose: 'password-reset',
        payload: null,
        expiresAt: new Date(),
      });
      emailPort.sendEmail.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await controller.requestPasswordReset({
        email: 'lele@example.com',
        captchaToken: 'valid-token',
      });

      expect(result).toEqual({ success: true });
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('lele@example.com'),
        expect.stringContaining('ECONNREFUSED'),
      );
      logged.mockRestore();
    });

    it('refuses an invalid captcha before even looking up the account', async () => {
      captchaPort.verify.mockResolvedValue(false);

      await expect(
        controller.requestPasswordReset({
          email: 'lele@example.com',
          captchaToken: 'bad-token',
        }),
      ).rejects.toThrow(InvalidCaptchaError);
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('the activity log', () => {
    const body = {
      email: 'lele@example.com',
      password: 'correct',
      captchaToken: 'valid-token',
    };

    function accountThatExists(isActive = true) {
      userRepository.findByEmail.mockResolvedValue(
        User.create({
          id: 'user-1',
          tenantId,
          email: 'lele@example.com',
          displayName: 'Lele',
          passwordHash: 'hashed',
          role: 'admin',
          isActive,
        }),
      );
    }

    it('says who signed in', async () => {
      accountThatExists();
      authPort.verifyPassword.mockResolvedValue(true);
      authPort.createSession.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        expiresAt: new Date(),
      });

      await controller.login(body, loginRequest(), buildResponse());

      expect(auditLog.events).toEqual([
        { tenantId, actorUserId: 'user-1', action: 'login.succeeded' },
      ]);
    });

    it('says a wrong password was tried on an account', async () => {
      accountThatExists();
      authPort.verifyPassword.mockResolvedValue(false);

      await expect(
        controller.login(body, loginRequest(), buildResponse()),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(auditLog.events).toEqual([
        {
          tenantId,
          actorUserId: 'user-1',
          action: 'login.failed',
          detail: { reason: 'wrong-password' },
        },
      ]);
    });

    it('does not write down an address nobody has', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(
        controller.login(body, loginRequest(), buildResponse()),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(auditLog.events).toEqual([]);
    });

    it('says an account that is switched off was tried with its right password', async () => {
      accountThatExists(false);
      authPort.verifyPassword.mockResolvedValue(true);

      await expect(
        controller.login(body, loginRequest(), buildResponse()),
      ).rejects.toBeInstanceOf(UserNotActiveError);

      expect(auditLog.events).toMatchObject([
        { action: 'login.failed', detail: { reason: 'deactivated' } },
      ]);
    });

    it('does not turn a failed sign-in into another answer when the log cannot be written', async () => {
      accountThatExists();
      authPort.verifyPassword.mockResolvedValue(false);
      auditLog.failEveryWriteWith(new Error('connection lost'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(
        controller.login(body, loginRequest(), buildResponse()),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('says whose password a reset link changed', async () => {
      verificationTokenPort.consumeToken.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        purpose: 'password-reset',
        payload: null,
        expiresAt: new Date(),
      });
      userRepository.findById.mockResolvedValue(
        User.create({
          id: 'user-1',
          tenantId,
          email: 'lele@example.com',
          displayName: 'Lele',
          passwordHash: 'old-hash',
          role: 'admin',
        }),
      );
      authPort.hashPassword.mockResolvedValue('new-hash');

      await controller.confirmPasswordReset({
        token: 'a-token',
        newPassword: 'new-password',
      });

      expect(auditLog.events).toEqual([
        {
          tenantId,
          actorUserId: 'user-1',
          action: 'account.password_reset',
          targetId: 'user-1',
        },
      ]);
    });
  });

  describe('confirmPasswordReset', () => {
    it('returns success when the token is valid', async () => {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'lele@example.com',
        displayName: 'Lele',
        passwordHash: 'old-hash',
        role: 'admin',
      });
      verificationTokenPort.consumeToken.mockResolvedValue({
        token: 'a-token',
        userId: 'user-1',
        tenantId,
        purpose: 'password-reset',
        payload: null,
        expiresAt: new Date(),
      });
      userRepository.findById.mockResolvedValue(user);
      authPort.hashPassword.mockResolvedValue('new-hash');

      const result = await controller.confirmPasswordReset({
        token: 'a-token',
        newPassword: 'new-password',
      });

      expect(authPort.invalidateAllSessionsForUser).toHaveBeenCalledWith(
        'user-1',
        tenantId,
      );
      expect(result).toEqual({ success: true });
    });

    it('lets InvalidOrExpiredTokenError through to the auth filter', async () => {
      verificationTokenPort.consumeToken.mockResolvedValue(null);

      await expect(
        controller.confirmPasswordReset({
          token: 'bad-token',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(InvalidOrExpiredTokenError);
    });

    it('lets unexpected errors propagate unchanged', async () => {
      verificationTokenPort.consumeToken.mockRejectedValue(
        new Error('db exploded'),
      );

      await expect(
        controller.confirmPasswordReset({
          token: 'a-token',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow('db exploded');
    });
  });

  describe('currentSession', () => {
    function controllerFor(demo: 'true' | undefined) {
      const env = testApiEnv({
        EDITOR_APP_URL: editorAppUrl,
        KOMETIO_DEMO: demo,
      });
      return new AuthController(
        {
          userRepository,
          authPort,
          verificationTokenPort,
          emailPort,
          deploymentLocale: { defaultLocale: async () => 'it' },
          captchaPort,
          tenant: resolvedTenant(tenantId),
        },
        env,
        new SessionCookies(env),
        new UndeliveredEmailLog(),
        new AuditRecorder(auditLog),
      );
    }

    function signedInAdmin() {
      const user = User.create({
        id: 'user-1',
        tenantId,
        email: 'admin@esempio.test',
        passwordHash: 'hash',
        role: 'admin',
        displayName: 'Admin',
      });
      userRepository.findById.mockResolvedValue(user);
    }

    it('says who is asking, with the role the person has', async () => {
      signedInAdmin();

      const answer = await controllerFor(undefined).currentSession(
        tenantId,
        'user-1',
      );

      expect(answer.role).toBe('admin');
    });

    it('says a publisher where the deployment is a demo, which is what its guard enforces', async () => {
      signedInAdmin();

      const answer = await controllerFor('true').currentSession(
        tenantId,
        'user-1',
      );

      expect(answer.role).toBe('publisher');
      expect(answer.email).toBe('admin@esempio.test');
    });
  });
});
