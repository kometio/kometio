import { describe, expect, it } from 'vitest';
import { FormSubmission } from './form-submission';

describe('FormSubmission entity', () => {
  const baseInput = {
    id: 'submission-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    pageId: 'page-1',
    formId: 'form-1',
    payload: { name: 'Mario Rossi', email: 'mario@example.com' },
  };

  it('defaults createdAt to now when not provided', () => {
    const before = new Date();
    const submission = FormSubmission.create(baseInput);
    const after = new Date();

    expect(submission.createdAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(submission.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const submission = FormSubmission.create({ ...baseInput, now });

    expect(submission.id).toBe('submission-1');
    expect(submission.tenantId).toBe('tenant-1');
    expect(submission.siteId).toBe('site-1');
    expect(submission.pageId).toBe('page-1');
    expect(submission.formId).toBe('form-1');
    expect(submission.payload).toEqual({
      name: 'Mario Rossi',
      email: 'mario@example.com',
    });
    expect(submission.createdAt).toEqual(now);
  });

  it('allows a null pageId (e.g. a site-wide form not tied to one page)', () => {
    const submission = FormSubmission.create({ ...baseInput, pageId: null });

    expect(submission.pageId).toBeNull();
  });

  it('allows a null formId (the form was deleted after this submission)', () => {
    const submission = FormSubmission.create({ ...baseInput, formId: null });

    expect(submission.formId).toBeNull();
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = { ...baseInput, createdAt: new Date('2026-01-01T00:00:00Z') };

    const submission = FormSubmission.fromProps(props);

    expect(submission.toProps()).toEqual(props);
  });
});
