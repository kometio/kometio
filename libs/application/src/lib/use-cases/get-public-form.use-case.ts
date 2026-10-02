import { FormNotFoundError } from '@kometio/domain-core';
import type { PublicForm } from '@kometio/api-contracts';
import type { FormRepositoryPort } from '@kometio/ports';

export interface GetPublicFormDeps {
  formRepository: FormRepositoryPort;
}

export interface GetPublicFormInput {
  tenantId: string;
  formId: string;
}

/** Fetched live on every public render (docs/adr/0015) — never snapshotted into a page's block props. */
export async function getPublicForm(
  deps: GetPublicFormDeps,
  input: GetPublicFormInput,
): Promise<PublicForm> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  // notificationEmails is deliberately omitted: private operational config,
  // never exposed to the public renderer or the browser.
  return {
    id: form.id,
    name: form.name,
    fields: form.fields,
    steps: form.steps,
  };
}
