import { FormNotFoundError } from '@kometio/domain-core';
import type { FormRepositoryPort } from '@kometio/ports';

export interface DeleteFormDeps {
  formRepository: FormRepositoryPort;
}

export interface DeleteFormInput {
  tenantId: string;
  formId: string;
}

export async function deleteForm(
  deps: DeleteFormDeps,
  input: DeleteFormInput,
): Promise<void> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  await deps.formRepository.delete(input.tenantId, input.formId);
}
