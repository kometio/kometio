import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { UpdateFormInput } from '../../lib/forms-api-client';
import { updateForm } from '../../lib/forms-api-client';
import { formQueryOptions } from './forms-queries';

// Reads through the same query the route loader already warmed (see
// routes/_shell.forms.$formId.tsx) — same pattern as usePageEditor.
export function useFormEditor(formId: string) {
  const { data: form } = useSuspenseQuery(formQueryOptions(formId));
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (input: UpdateFormInput) => updateForm(formId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(formQueryOptions(formId).queryKey, updated);
      // Partial key: invalidates every cached page of list results for this
      // site (see forms-queries.ts), not just one page number.
      queryClient.invalidateQueries({ queryKey: ['forms', updated.siteId] });
    },
  });

  return {
    form,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
