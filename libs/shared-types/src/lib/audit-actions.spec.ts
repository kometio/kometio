import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_RETENTION_DAYS,
  auditActionSchema,
  auditDetailSchema,
} from './audit-actions';

describe('AUDIT_ACTIONS', () => {
  it('names each thing once, as `subject.what_happened`', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  it('is what the schema accepts and nothing else', () => {
    expect(auditActionSchema.safeParse('login.succeeded').success).toBe(true);
    expect(auditActionSchema.safeParse('page.published').success).toBe(false);
  });
});

describe('auditDetailSchema', () => {
  it('takes small facts', () => {
    expect(
      auditDetailSchema.safeParse({
        role: 'editor',
        keyChanged: true,
        count: 3,
        provider: null,
      }).success,
    ).toBe(true);
  });

  it('refuses what is not a small fact: an object, a list, a whole body', () => {
    expect(auditDetailSchema.safeParse({ body: { name: 'x' } }).success).toBe(
      false,
    );
    expect(auditDetailSchema.safeParse({ list: ['a'] }).success).toBe(false);
    expect(auditDetailSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('AUDIT_RETENTION_DAYS', () => {
  it('is the number the editor says and the clean-up uses', () => {
    expect(AUDIT_RETENTION_DAYS).toBe(90);
  });
});
