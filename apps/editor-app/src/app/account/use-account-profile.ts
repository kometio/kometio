import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountProfile } from '@kometio/api-contracts';
import {
  removeAccountAvatar,
  updateAccountProfile,
  uploadAccountAvatar,
  type UpdateAccountProfileInput,
} from '../../lib/account-api-client';
import { accountProfileQueryOptions } from './account-queries';

export function useAccountProfile() {
  const queryClient = useQueryClient();
  const onSuccess = (updated: AccountProfile) => {
    queryClient.setQueryData(accountProfileQueryOptions().queryKey, updated);
    // The people list shows names and pictures too.
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const update = useMutation({
    mutationFn: (input: UpdateAccountProfileInput) =>
      updateAccountProfile(input),
    onSuccess,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadAccountAvatar(file),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: () => removeAccountAvatar(),
    onSuccess,
  });

  return {
    updateProfile: update.mutateAsync,
    isSaving: update.isPending,
    uploadAvatar: upload.mutateAsync,
    removeAvatar: remove.mutateAsync,
    isChangingAvatar: upload.isPending || remove.isPending,
  };
}
