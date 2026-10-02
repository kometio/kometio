import { randomUUID } from 'node:crypto';
import { Form } from '@kometio/domain-core';
import type { FormRepositoryPort, SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface CreateFormDeps {
  formRepository: FormRepositoryPort;
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface CreateFormInput {
  tenantId: string;
  siteId: string;
  name: string;
}

export async function createForm(
  deps: CreateFormDeps,
  input: CreateFormInput,
): Promise<Form> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  const form = Form.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    name: input.name,
  });

  await deps.formRepository.add(form);

  return form;
}
