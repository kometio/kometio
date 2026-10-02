import { describe, expect, it } from 'vitest';
import {
  formRecordSchema,
  paginatedFormSubmissionsSchema,
  publicFormSchema,
} from './form-record';

const field = { id: 'f1', label: 'Email', type: 'email', required: true };
const form = {
  id: 'form-1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  name: 'Contatti',
  fields: [field],
  steps: [],
  notificationEmails: ['info@esempio.test'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  submissionCount: 3,
};

describe('formRecordSchema', () => {
  it('accepts a form with its fields and the number of answers received', () => {
    expect(formRecordSchema.parse(form).submissionCount).toBe(3);
  });

  it('refuses a negative count of answers', () => {
    expect(
      formRecordSchema.safeParse({ ...form, submissionCount: -1 }).success,
    ).toBe(false);
  });

  it('refuses a field of a kind no form has', () => {
    expect(
      formRecordSchema.safeParse({
        ...form,
        fields: [{ ...field, type: 'signature' }],
      }).success,
    ).toBe(false);
  });
});

describe('publicFormSchema', () => {
  it('shows a visitor the fields and never the notification addresses', () => {
    const parsed = publicFormSchema.parse({
      id: form.id,
      name: form.name,
      fields: form.fields,
      steps: form.steps,
      notificationEmails: form.notificationEmails,
    });

    expect('notificationEmails' in parsed).toBe(false);
  });
});

describe('paginatedFormSubmissionsSchema', () => {
  it('carries the answers with the fields they answer and the pages they came from', () => {
    const parsed = paginatedFormSubmissionsSchema.parse({
      items: [
        {
          id: 's1',
          payload: { f1: 'ada@esempio.test' },
          createdAt: '2026-01-02T00:00:00.000Z',
          pageId: 'p1',
        },
      ],
      total: 1,
      fields: [field],
      pages: [{ id: 'p1', pageGroupId: 'g1', locale: 'it', title: 'Contatti' }],
    });

    expect(parsed.items[0]?.payload).toEqual({ f1: 'ada@esempio.test' });
  });
});
