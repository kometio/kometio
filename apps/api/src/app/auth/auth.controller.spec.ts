import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
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
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';
import { AuthController } from './auth.controller';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { SESSION_COOKIE_NAME, SessionCookies } from './session-cookies';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';

const tenantId = 'tenant-1';
const editorAppUrl = 'https://editor.example.com';

function buildResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
}

// Express's Request has 100+ members — only `cookies` is read here, so a
// minimal double stands in via `unknown` rather than implementing the whole
// interface.
function fakeRequest(cookies: Record<string, string | undefined>): Request {
  return { cookies } as unknown as Request;
}

describe('AuthController', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authPort: jest.Mocked<AuthPort>;
  let verificationTokenPort: jest.Mocked<VerificationTokenPort>;
  let emailPort: jest.Mocked<EmailPort>;
  let captchaPort: jest.Mocked<CaptchaPort>;
  let controller: AuthController;

  beforeEach(() => {
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
    };
    verificationTokenPort = {
      createToken: jest.fn(),
      consumeToken: jest.fn(),
    };
    emailPort = {
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
        tenant: { require: async () => tenantId } as DeploymentTenantResolver,
      },
      env,
      new SessionCookies(env),
      new UndeliveredEmailLog(),
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
        response,
      );

      expect(result).toEqual({ userId: 'user-1' });
      expect(response.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'a-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
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
      const request = { cookies: undefined } as unknown as Request;
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
});
