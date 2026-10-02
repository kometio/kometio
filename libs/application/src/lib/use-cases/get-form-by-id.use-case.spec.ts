import { describe, expect, it } from 'vitest';
import { Form, FormNotFoundError } from '@kometio/domain-core';
import { getFormById } from './get-form-by-id.use-case';
import { InMemoryFormRepository } from '@kometio/testing';

const tenantId = 'tenant-1';

describe('getFormById', () => {
  it('returns the form scoped to its tenant', async () => {
    const formRepository = new InMemoryFormRepository();
    const form = Form.create({
      id: 'form-1',
      tenantId,
      siteId: 'site-1',
      name: 'Contatti',
    });
    await formRepository.add(form);

    const found = await getFormById(
      { formRepository },
      { tenantId, formId: 'form-1' },
    );

    expect(found.id).toBe('form-1');
  });

  it('throws FormNotFoundError for an id that does not exist', async () => {
    const formRepository = new InMemoryFormRepository();

    await expect(
      getFormById({ formRepository }, { tenantId, formId: 'does-not-exist' }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it('throws FormNotFoundError for a form belonging to a different tenant', async () => {
    const formRepository = new InMemoryFormRepository();
    const form = Form.create({
      id: 'form-1',
      tenantId: 'other-tenant',
      siteId: 'site-1',
      name: 'Contatti',
    });
    await formRepository.add(form);

    await expect(
      getFormById({ formRepository }, { tenantId, formId: 'form-1' }),
    ).rejects.toThrow(FormNotFoundError);
  });
});
