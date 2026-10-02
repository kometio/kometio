import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmEmailChange,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from './auth-api-client';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('auth-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login posts credentials and the captcha token to the login endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ userId: 'user-1' }));

    await login('lele@example.com', 'correct-horse-battery', 'captcha-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          email: 'lele@example.com',
          password: 'correct-horse-battery',
          captchaToken: 'captcha-token',
        }),
      }),
    );
  });

  it('logout posts to the logout endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    await logout();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('requestPasswordReset posts the email and captcha token to the request-password-reset endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    await requestPasswordReset('lele@example.com', 'captcha-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/request-password-reset'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'lele@example.com',
          captchaToken: 'captcha-token',
        }),
      }),
    );
  });

  it('resetPassword posts the token and new password to the reset-password endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    await resetPassword('a-token', 'new-password');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/reset-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'a-token', newPassword: 'new-password' }),
      }),
    );
  });

  it('verifyEmail posts the token to the verify-email endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    await verifyEmail('a-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/verify-email'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'a-token' }),
      }),
    );
  });

  it('confirmEmailChange posts the token to the confirm endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));

    await confirmEmailChange('a-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/confirm-email-change'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'a-token' }),
      }),
    );
  });
});
