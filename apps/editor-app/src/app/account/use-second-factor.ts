import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  beginSecondFactor,
  confirmSecondFactor,
  disableSecondFactor,
  regenerateRecoveryCodes,
} from '../../lib/second-factor-api-client';
import {
  accountSessionsQueryOptions,
  secondFactorStatusQueryOptions,
} from './account-queries';

/**
 * The signed-in person's second step of sign-in (docs/adr/0137): what it is
 * now, and the four things that change it.
 *
 * Turning it on or off ends the person's other sign-ins on the server, so both
 * refresh the list of where they are signed in as well as the status.
 */
export function useSecondFactor() {
  const queryClient = useQueryClient();
  const status = useQuery(secondFactorStatusQueryOptions());
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: secondFactorStatusQueryOptions().queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: accountSessionsQueryOptions().queryKey,
      }),
    ]);

  const begin = useMutation({
    mutationFn: (password: string) => beginSecondFactor(password),
  });
  const confirm = useMutation({
    mutationFn: (code: string) => confirmSecondFactor(code),
    onSuccess: refresh,
  });
  const codes = useMutation({
    mutationFn: (password: string) => regenerateRecoveryCodes(password),
    onSuccess: refresh,
  });
  const disable = useMutation({
    mutationFn: (password: string) => disableSecondFactor(password),
    onSuccess: refresh,
  });

  return {
    status: status.data,
    isLoading: status.isPending,
    begin: begin.mutateAsync,
    confirm: confirm.mutateAsync,
    regenerateRecoveryCodes: codes.mutateAsync,
    disable: disable.mutateAsync,
  };
}
