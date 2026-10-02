import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import * as authApi from '../../lib/auth-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useSession } from './use-session';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn(),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useSession', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handleLogin calls the login API with the given credentials', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(authApi.login).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => {
      await result.current.handleLogin(
        'lele@example.com',
        'correct',
        'captcha-token',
      );
    });

    expect(authApi.login).toHaveBeenCalledWith(
      'lele@example.com',
      'correct',
      'captcha-token',
    );
  });

  it('handleLogin propagates the error when login fails', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(authApi.login).mockRejectedValue(
      new Error('Invalid credentials'),
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await expect(
      result.current.handleLogin('lele@example.com', 'wrong', 'captcha-token'),
    ).rejects.toThrow('Invalid credentials');
  });

  it('handleLogout calls the logout API and navigates to /login', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(authApi.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: '/login' });
  });

  /*
   * The next person to sign in on the same tab saw the last one's name and
   * email in the account menu until the profile was fetched again.
   */
  it('handleLogout forgets everything read while signed in', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['account', 'profile'], {
      email: 'a@example.com',
    });
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(queryClient.getQueryData(['account', 'profile'])).toBeUndefined();
  });

  it('handleLogout still navigates to /login even if the server call fails', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(navigate).toHaveBeenCalledWith({ to: '/login' });
  });
});
