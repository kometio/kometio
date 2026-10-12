import { describe, expect, it } from 'vitest';
import { MAX_NOTIFICATION_EMAILS } from '@kometio/domain-core';
import {
  createFormBodySchema,
  duplicateFormBodySchema,
  listFormsQuerySchema,
  listFormSubmissionsQuerySchema,
  updateFormBodySchema,
} from './form-requests';

const siteId = '00000000-0000-4000-8000-000000000000';

describe('form bodies', () => {
  it('creates and duplicates by a name that is not empty', () => {
    expect(
      createFormBodySchema.safeParse({ siteId, name: 'Contact' }).success,
    ).toBe(true);
    expect(createFormBodySchema.safeParse({ siteId, name: '' }).success).toBe(
      false,
    );
    expect(duplicateFormBodySchema.safeParse({ name: 'Copy' }).success).toBe(
      true,
    );
    expect(duplicateFormBodySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('updates with its fields, and takes steps and notification addresses as empty when left out', () => {
    const parsed = updateFormBodySchema.parse({ name: 'Contact', fields: [] });

    expect(parsed.steps).toEqual([]);
    expect(parsed.notificationEmails).toEqual([]);
  });

  it('trims the notification addresses and refuses more than a team', () => {
    const parsed = updateFormBodySchema.parse({
      name: 'Contact',
      fields: [],
      notificationEmails: [' ada@example.test '],
    });
    expect(parsed.notificationEmails).toEqual(['ada@example.test']);

    const tooMany = Array.from(
      { length: MAX_NOTIFICATION_EMAILS + 1 },
      (_, i) => `a${i}@example.test`,
    );
    expect(
      updateFormBodySchema.safeParse({
        name: 'Contact',
        fields: [],
        notificationEmails: tooMany,
      }).success,
    ).toBe(false);
  });
});

describe('form lists', () => {
  it('pages the forms by up to a hundred', () => {
    expect(listFormsQuerySchema.parse({ siteId })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(
      listFormsQuerySchema.safeParse({ siteId, pageSize: '101' }).success,
    ).toBe(false);
  });

  it('pages the submissions by fewer, since a row carries a whole payload', () => {
    expect(
      listFormSubmissionsQuerySchema.safeParse({ pageSize: '50' }).success,
    ).toBe(true);
    expect(
      listFormSubmissionsQuerySchema.safeParse({ pageSize: '51' }).success,
    ).toBe(false);
  });
});
