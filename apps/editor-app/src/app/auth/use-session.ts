import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  login as apiLogin,
  loginSecondFactor as apiLoginSecondFactor,
  logout as apiLogout,
} from '../../lib/auth-api-client';

export function useSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Errors intentionally propagate to the caller (LoginForm shows them).
  const loginMutation = useMutation({
    mutationFn: ({
      email,
      password,
      captchaToken,
    }: {
      email: string;
      password: string;
      captchaToken: string;
    }) => apiLogin(email, password, captchaToken),
    // The same reason as logout below, from the other side: a session that
    // expired sends its tab to /login without logging out, and whoever
    // signs in there next would inherit the last person's role — and with
    // it their buttons — for as long as the cached session lived.
    //
    // Only when a session was made: a right password that leads to a code
    // has signed nobody in yet.
    onSuccess: (answer) => {
      if ('userId' in answer) queryClient.clear();
    },
  });

  // The second step: the code, against the challenge the password led to.
  // An error propagates, with its body: a wrong code carries a new challenge.
  const secondFactorMutation = useMutation({
    mutationFn: ({ challenge, code }: { challenge: string; code: string }) =>
      apiLoginSecondFactor(challenge, code),
    onSuccess: () => queryClient.clear(),
  });

  // Always redirects, whether or not the server call actually succeeded
  // (e.g. the session already expired) — logging out always lands on
  // /login, that's a single, non-negotiable policy, not a per-caller
  // choice.
  //
  // Everything read while signed in goes with the session: the next person
  // to sign in on this tab would otherwise see the last one's name, email
  // and screens until each query happened to be fetched again.
  const logoutMutation = useMutation({
    mutationFn: () => apiLogout(),
    onSettled: () => {
      queryClient.clear();
      return navigate({ to: '/login' });
    },
  });

  const handleLogin = useCallback(
    (email: string, password: string, captchaToken: string) =>
      loginMutation.mutateAsync({ email, password, captchaToken }),
    [loginMutation],
  );

  const handleSecondFactor = useCallback(
    (challenge: string, code: string) =>
      secondFactorMutation.mutateAsync({ challenge, code }),
    [secondFactorMutation],
  );

  // Best-effort: even if the server call fails, the caller still gets a
  // resolved promise — the redirect in onSettled above already happened
  // either way, so there is nothing left for the caller to react to.
  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignored on purpose, see comment above
    }
  }, [logoutMutation]);

  return { handleLogin, handleSecondFactor, handleLogout };
}
