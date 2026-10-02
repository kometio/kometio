import { useMutation } from '@tanstack/react-query';
import {
  changePassword,
  requestEmailChange,
  type ChangePasswordInput,
  type RequestEmailChangeInput,
} from '../../lib/account-api-client';

/**
 * How the signed-in person signs in: their password, and the address they
 * sign in with. Nothing here refreshes a cache: a password is not shown
 * anywhere, and an email change is only asked for — the profile shows the
 * new address once the link has been opened, and that page refreshes it.
 */
export function useAccountCredentials() {
  const password = useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
  });
  const email = useMutation({
    mutationFn: (input: RequestEmailChangeInput) => requestEmailChange(input),
  });
  return {
    changePassword: password.mutateAsync,
    requestEmailChange: email.mutateAsync,
  };
}
