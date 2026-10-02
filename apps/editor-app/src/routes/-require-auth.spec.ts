import { describe, expect, it } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { requireAuth } from './-require-auth';
import { ApiError } from '../lib/http-client';

describe('requireAuth', () => {
  it('resolves with the loader result when it succeeds', async () => {
    const result = await requireAuth(() => Promise.resolve({ id: 'page-1' }));

    expect(result).toEqual({ id: 'page-1' });
  });

  it('redirects to /login when the loader rejects with a 401 ApiError', async () => {
    expect.assertions(3);

    try {
      await requireAuth(() =>
        Promise.reject(new ApiError(401, { message: 'Unauthorized' })),
      );
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      expect(error).toHaveProperty('options');
      expect((error as { options: { to: string } }).options.to).toBe('/login');
    }
  });

  it('rethrows a non-401 ApiError unchanged', async () => {
    const forbidden = new ApiError(403, { message: 'Forbidden' });

    await expect(requireAuth(() => Promise.reject(forbidden))).rejects.toBe(
      forbidden,
    );
  });

  it('rethrows an error that is not an ApiError unchanged', async () => {
    const networkError = new Error('network down');

    await expect(requireAuth(() => Promise.reject(networkError))).rejects.toBe(
      networkError,
    );
  });
});
