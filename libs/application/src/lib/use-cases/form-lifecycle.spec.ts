import { describe, expect, it } from 'vitest';
import { FormNotFoundError } from '@kometio/domain-core';
import { createForm } from './create-form.use-case';
import { updateForm } from './update-form.use-case';
import { listForms } from './list-forms.use-case';
import { deleteForm } from './delete-form.use-case';
import {
  InMemoryFormRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';

describe('form lifecycle: create -> update -> list -> delete', () => {
  const tenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';
  const siteId = 'site-1';

  function setup() {
    const formRepository = new InMemoryFormRepository();
    return {
      formRepository,
      // This tenant's site, and one of another tenant's.
      siteRepository: new InMemorySiteRepository(
        buildSite(),
        buildSite({
          id: 'site-other-tenant',
          tenantId: 'tenant-2',
          domain: 'altrui.example',
        }),
      ),
    };
  }

  it('creates a form with empty fields, no steps, and no notification email', async () => {
    const deps = setup();

    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });

    expect(form.name).toBe('Contatti');
    expect(form.fields).toEqual([]);
    expect(form.steps).toEqual([]);
    expect(form.notificationEmails).toEqual([]);
  });

  it('updates a form with fields and a notification email', async () => {
    const deps = setup();
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });

    const updated = await updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Richiedi preventivo',
      fields: [{ id: 'email', label: 'Email', type: 'email', required: true }],
      steps: [],
      notificationEmails: ['owner@example.com'],
    });

    expect(updated.name).toBe('Richiedi preventivo');
    expect(updated.fields).toHaveLength(1);
    expect(updated.notificationEmails).toEqual(['owner@example.com']);
  });

  it('updates a form with steps and per-field stepId assignments', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Candidatura',
    });

    const updated = await updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Candidatura',
      fields: [
        {
          id: 'nome',
          label: 'Nome',
          type: 'text',
          required: true,
          stepId: 'dati-personali',
        },
        {
          id: 'esperienza',
          label: 'Esperienza',
          type: 'textarea',
          required: false,
          stepId: 'dettagli',
        },
      ],
      steps: [
        { id: 'dati-personali', title: 'Dati personali' },
        { id: 'dettagli', title: 'Dettagli' },
      ],
      notificationEmails: [],
    });

    expect(updated.steps).toEqual([
      { id: 'dati-personali', title: 'Dati personali' },
      { id: 'dettagli', title: 'Dettagli' },
    ]);
    expect(updated.fields[0].stepId).toBe('dati-personali');
    expect(updated.fields[1].stepId).toBe('dettagli');
  });

  it('updateForm throws FormNotFoundError for a nonexistent id', async () => {
    const deps = setup();

    await expect(
      updateForm(deps, {
        tenantId,
        formId: 'does-not-exist',
        name: 'x',
        fields: [],
        steps: [],
        notificationEmails: [],
      }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it('updateForm does not touch a different tenant', async () => {
    const deps = setup();
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });

    await expect(
      updateForm(deps, {
        tenantId: otherTenantId,
        formId: form.id,
        name: 'hijacked',
        fields: [],
        steps: [],
        notificationEmails: [],
      }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it('listForms paginates and scopes by tenant/site', async () => {
    const deps = setup();
    for (let i = 0; i < 3; i++) {
      await createForm(deps, { tenantId, siteId, name: `Form ${i}` });
    }
    await createForm(deps, {
      tenantId: otherTenantId,
      siteId: 'site-other-tenant',
      name: 'non mio',
    });

    const result = await listForms(deps, {
      tenantId,
      siteId,
      page: 1,
      pageSize: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('deleteForm removes the form', async () => {
    const deps = setup();
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });

    await deleteForm(deps, { tenantId, formId: form.id });

    expect(await deps.formRepository.findById(tenantId, form.id)).toBeNull();
  });

  it('deleteForm throws FormNotFoundError for a nonexistent id', async () => {
    const deps = setup();

    await expect(
      deleteForm(deps, { tenantId, formId: 'does-not-exist' }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it('deleteForm does not touch a different tenant', async () => {
    const deps = setup();
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });

    await expect(
      deleteForm(deps, { tenantId: otherTenantId, formId: form.id }),
    ).rejects.toThrow(FormNotFoundError);
    expect(
      await deps.formRepository.findById(tenantId, form.id),
    ).not.toBeNull();
  });
});
