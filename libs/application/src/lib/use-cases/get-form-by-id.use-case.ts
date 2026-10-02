import { FormNotFoundError, type Form } from '@kometio/domain-core';
import type { FormRepositoryPort } from '@kometio/ports';

export interface GetFormByIdDeps {
  formRepository: FormRepositoryPort;
}

export interface GetFormByIdInput {
  tenantId: string;
  formId: string;
}

/**
 * Security review 2026-08-24, second backend pass: `FormsController` was
 * calling `formRepository.findById` straight from the controller — the one
 * place in it that went around the application layer, while create, update
 * and list all went through a use case.
 */
export async function getFormById(
  deps: GetFormByIdDeps,
  input: GetFormByIdInput,
): Promise<Form> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }
  return form;
}
