import type { Form } from '@kometio/domain-core';
import type { PaginatedResult, FormRepositoryPort } from '@kometio/ports';

export interface ListFormsDeps {
  formRepository: FormRepositoryPort;
}

export interface ListFormsInput {
  tenantId: string;
  siteId: string;
  page: number;
  pageSize: number;
}

export function listForms(
  deps: ListFormsDeps,
  input: ListFormsInput,
): Promise<PaginatedResult<Form>> {
  return deps.formRepository.listBySite(input.tenantId, input.siteId, {
    page: input.page,
    pageSize: input.pageSize,
  });
}
