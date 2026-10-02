import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../../lib/auth-api-client';

export function useResetPassword(token: string) {
  return useMutation({
    mutationFn: (newPassword: string) => resetPassword(token, newPassword),
  });
}
