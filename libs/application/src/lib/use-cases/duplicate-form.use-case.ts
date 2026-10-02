import { randomUUID } from 'node:crypto';
import { FormNotFoundError, type Form } from '@kometio/domain-core';
import type { FormRepositoryPort } from '@kometio/ports';

export interface DuplicateFormDeps {
  formRepository: FormRepositoryPort;
}

export interface DuplicateFormInput {
  tenantId: string;
  formId: string;
  /** What the copy is called. The caller names it: what "copy of" is depends on the language of whoever asked. */
  name: string;
}

/**
 * A copy of a form — the structure somebody spent time on, without its
 * answers — for a form that is nearly the one wanted.
 *
 * The copy is in the same site as the original, and is on no page: nothing
 * can be submitted to it until somebody places it.
 */
export async function duplicateForm(
  deps: DuplicateFormDeps,
  input: DuplicateFormInput,
): Promise<Form> {
  const original = await deps.formRepository.findById(
    input.tenantId,
    input.formId,
  );
  if (!original) {
    throw new FormNotFoundError(input.formId);
  }
  const copy = original.duplicate({ id: randomUUID(), name: input.name });
  await deps.formRepository.add(copy);
  return copy;
}
