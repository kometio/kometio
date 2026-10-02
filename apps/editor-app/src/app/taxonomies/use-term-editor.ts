import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  moveTerm,
  updateTerm,
  type TaxonomyRecord,
  type TermRecord,
} from '../../lib/taxonomies-api-client';
import { termsQueryOptions } from './taxonomies-queries';
import { termFormToChanges, type TermFormValues } from './term-form';

/**
 * Saving a term's page. Its fields and its place in the tree are two calls
 * (the API moves a term by its own endpoint), made one after the other, and
 * the answer is the term as the second left it — the saved state of the
 * form.
 */
export function useTermEditor(taxonomy: TaxonomyRecord, term: TermRecord) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (values: TermFormValues) => {
      const saved = await updateTerm(term.id, termFormToChanges(term, values));
      const parentId = values.parentId || null;
      return taxonomy.hierarchical && parentId !== saved.parentId
        ? moveTerm(term.id, parentId)
        : saved;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: termsQueryOptions(taxonomy.id).queryKey,
      }),
  });
  return { save: mutation.mutateAsync, isSaving: mutation.isPending };
}
