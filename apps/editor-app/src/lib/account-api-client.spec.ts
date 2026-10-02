import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changePassword, requestEmailChange } from './account-api-client';

function emptyResponse() {
  return { ok: true, status: 204 } as Response;
}

describe('account-api-client: how the person signs in', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('changePassword posts both passwords, with the session cookie', async () => {
    vi.mocked(fetch).mockResolvedValue(emptyResponse());

    await changePassword({
      currentPassword: 'old',
      newPassword: 'new-password',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/account/password'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: 'old',
          newPassword: 'new-password',
        }),
      }),
    );
  });

  it('requestEmailChange posts the new address and the current password', async () => {
    vi.mocked(fetch).mockResolvedValue(emptyResponse());

    await requestEmailChange({
      newEmail: 'nuova@example.com',
      currentPassword: 'old',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/account/email-change'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          newEmail: 'nuova@example.com',
          currentPassword: 'old',
        }),
      }),
    );
  });
});
