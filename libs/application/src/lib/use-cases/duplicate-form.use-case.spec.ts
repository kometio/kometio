import { describe, expect, it } from 'vitest';
import { FormNotFoundError } from '@kometio/domain-core';
import {
  InMemoryFormRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';
import { createForm } from './create-form.use-case';
import { duplicateForm } from './duplicate-form.use-case';
import { updateForm } from './update-form.use-case';

const tenantId = 'tenant-1';
const siteId = 'site-1';

async function setup() {
  const formRepository = new InMemoryFormRepository();
  const deps = {
    formRepository,
    siteRepository: new InMemorySiteRepository(buildSite()),
  };
  const original = await createForm(deps, {
    tenantId,
    siteId,
    name: 'Contatti',
  });
  await updateForm(deps, {
    tenantId,
    formId: original.id,
    name: 'Contatti',
    fields: [{ id: 'email', label: 'Email', type: 'email', required: true }],
    steps: [],
    notificationEmails: ['owner@example.com'],
  });
  return { deps, original };
}

describe('duplicateForm', () => {
  it('saves a copy with the structure of the original under the name it was given, next to it', async () => {
    const { deps, original } = await setup();

    const copy = await duplicateForm(deps, {
      tenantId,
      formId: original.id,
      name: 'Copia di Contatti',
    });

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Copia di Contatti');
    expect(copy.fields).toEqual([
      { id: 'email', label: 'Email', type: 'email', required: true },
    ]);
    expect(copy.notificationEmails).toEqual(['owner@example.com']);
    const saved = await deps.formRepository.findById(tenantId, copy.id);
    expect(saved?.name).toBe('Copia di Contatti');
    // The original is where it was.
    const still = await deps.formRepository.findById(tenantId, original.id);
    expect(still?.name).toBe('Contatti');
  });

  it('is not found for a form that is not there, or is another tenant’s', async () => {
    const { deps, original } = await setup();

    await expect(
      duplicateForm(deps, { tenantId, formId: 'nope', name: 'X' }),
    ).rejects.toBeInstanceOf(FormNotFoundError);
    await expect(
      duplicateForm(deps, {
        tenantId: 'tenant-2',
        formId: original.id,
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(FormNotFoundError);
  });
});
