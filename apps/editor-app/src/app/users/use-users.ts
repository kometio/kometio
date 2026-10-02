import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelInvite as apiCancelInvite,
  inviteUser as apiInviteUser,
  resendInvite as apiResendInvite,
  setUserActive as apiSetUserActive,
  updateUserRole as apiUpdateUserRole,
  type InviteUserInput,
  type UserRole,
} from '../../lib/users-api-client';

// Same split as usePagesList/useMediaLibrary: fetching the list is the
// route loader's job (see routes/_shell.users.index.tsx), this hook only
// owns the actions available from the Utenti section — invite, change
// role, activate/deactivate, and what is done with an invitation still
// waiting.
export function useUsers() {
  const queryClient = useQueryClient();

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    [queryClient],
  );

  const inviteMutation = useMutation({
    mutationFn: (input: InviteUserInput) => apiInviteUser(input),
    onSuccess: invalidateList,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiUpdateUserRole(id, role),
    onSuccess: invalidateList,
  });

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiSetUserActive(id, isActive),
    onSuccess: invalidateList,
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => apiResendInvite(id),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => apiCancelInvite(id),
    onSuccess: invalidateList,
  });

  return {
    resendInvite: resendInviteMutation.mutateAsync,
    cancelInvite: cancelInviteMutation.mutateAsync,
    inviteUser: inviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    updateUserRole: (id: string, role: UserRole) =>
      updateRoleMutation.mutateAsync({ id, role }),
    setUserActive: (id: string, isActive: boolean) =>
      setActiveMutation.mutateAsync({ id, isActive }),
  };
}
