import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmEmailChange } from '../../lib/auth-api-client';

/**
 * Follows the link mailed to the new address, once.
 *
 * The link works a single time, and Strict Mode runs an effect twice in
 * development: without the guard the second call would be refused and the
 * page would say the link is invalid right after it worked.
 */
export function useConfirmEmailChange(token: string) {
  const queryClient = useQueryClient();
  const attempted = useRef<string | null>(null);
  const { mutate, status } = useMutation({
    mutationFn: (changeToken: string) => confirmEmailChange(changeToken),
    onSuccess: () => {
      // Whoever is signed in on this browser is now known by another address.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      void queryClient.invalidateQueries({ queryKey: ['account'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  useEffect(() => {
    if (attempted.current === token) return;
    attempted.current = token;
    mutate(token);
  }, [token, mutate]);

  return status;
}
