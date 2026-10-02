import { describe, expect, it } from 'vitest';
import {
  importJobListSchema,
  importJobRecordSchema,
} from './import-job-record';

const job = {
  id: 'j1',
  siteId: 'site-1',
  source: 'wordpress',
  fileName: 'export.xml',
  fileBytes: 1024,
  status: 'analyzing',
  report: null,
  failureReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

describe('importJobRecordSchema', () => {
  it('accepts a job that has not finished: no report, no failure, no end', () => {
    expect(importJobRecordSchema.parse(job)).toEqual(job);
  });

  it('refuses a status the import has no such stage for', () => {
    expect(
      importJobRecordSchema.safeParse({ ...job, status: 'done' }).success,
    ).toBe(false);
  });

  it('refuses a file of negative size', () => {
    expect(
      importJobRecordSchema.safeParse({ ...job, fileBytes: -1 }).success,
    ).toBe(false);
  });
});

describe('importJobListSchema', () => {
  it('lists jobs', () => {
    expect(importJobListSchema.parse({ items: [job] }).items).toHaveLength(1);
  });
});
