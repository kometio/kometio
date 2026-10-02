import { FormNotFoundError, type Form } from '@kometio/domain-core';
import type { FormField, FormStep } from '@kometio/shared-types';
import type { FormRepositoryPort } from '@kometio/ports';

export interface UpdateFormDeps {
  formRepository: FormRepositoryPort;
}

export interface UpdateFormInput {
  tenantId: string;
  formId: string;
  name: string;
  fields: FormField[];
  steps: FormStep[];
  notificationEmails: string[];
}

export async function updateForm(
  deps: UpdateFormDeps,
  input: UpdateFormInput,
): Promise<Form> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  form.update({
    name: input.name,
    fields: input.fields,
    steps: input.steps,
    notificationEmails: input.notificationEmails,
  });
  await deps.formRepository.save(form);

  return form;
}
