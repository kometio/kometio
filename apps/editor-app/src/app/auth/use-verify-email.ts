import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { verifyEmail } from '../../lib/auth-api-client';

export function useVerifyEmail(token: string) {
  const { mutate, status } = useMutation({
    mutationFn: (verificationToken: string) => verifyEmail(verificationToken),
  });

  useEffect(() => {
    mutate(token);
  }, [token, mutate]);

  return status;
}
