import { describe, expect, it } from 'vitest';
import type { WordPressAnalysis } from '@kometio/shared-types';
import {
  ImportJob,
  ImportJobAlreadyFinishedError,
  ImportJobNotFoundError,
} from './import-job';

const REPORT: WordPressAnalysis = {
  siteTitle: 'Il sito',
  sourceUrl: 'https://esempio.test',
  found: {
    pages: 1,
    posts: 0,
    attachments: 0,
    menuItems: 0,
    otherTypes: [],
  },
  pages: { whole: 1, partial: 0, empty: 0 },
  blocks: {
    total: 1,
    native: 1,
    fromFields: 0,
    fromFieldsByBlock: [],
    dropped: 0,
    quarantined: [],
  },
  terms: [],
  warnings: [],
};

function buildJob(): ImportJob {
  return ImportJob.create({
    id: 'job-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    source: 'wordpress',
    fileName: 'export.xml',
    fileBytes: 314_000_000,
    createdBy: 'user-1',
    now: new Date('2026-09-24T20:00:00.000Z'),
  });
}

describe('ImportJob', () => {
  it('starts running, with nothing to report yet', async () => {
    const job = buildJob();

    expect(job.status).toBe('analyzing');
    expect(job.isRunning).toBe(true);
    expect(job.report).toBeNull();
    expect(job.failureReason).toBeNull();
    expect(job.toProps().finishedAt).toBeNull();
  });

  it('keeps what it was told about the file', () => {
    expect(buildJob().toProps()).toMatchObject({
      id: 'job-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      source: 'wordpress',
      fileName: 'export.xml',
      fileBytes: 314_000_000,
      createdBy: 'user-1',
      createdAt: new Date('2026-09-24T20:00:00.000Z'),
    });
  });

  it('answers for the three things a caller looks it up by', () => {
    // What the repository scopes on and what the editor polls with.
    const job = buildJob();

    expect(job.id).toBe('job-1');
    expect(job.tenantId).toBe('tenant-1');
    expect(job.siteId).toBe('site-1');
  });

  it('carries the report and stops running when it succeeds', () => {
    const job = buildJob();
    const finishedAt = new Date('2026-09-24T20:00:04.000Z');

    job.succeed(REPORT, finishedAt);

    expect(job.status).toBe('analyzed');
    expect(job.isRunning).toBe(false);
    expect(job.report).toEqual(REPORT);
    expect(job.toProps().finishedAt).toEqual(finishedAt);
  });

  it('carries the reason and stops running when it fails', () => {
    // The reason is shown to whoever uploaded the file, so it is part of
    // the outcome rather than something logged and lost.
    const job = buildJob();

    job.fail('This file could not be read as a WordPress export.');

    expect(job.status).toBe('failed');
    expect(job.isRunning).toBe(false);
    expect(job.failureReason).toBe(
      'This file could not be read as a WordPress export.',
    );
    expect(job.report).toBeNull();
  });

  it('refuses to finish twice', () => {
    // Two things finishing the same job means two things are doing the
    // work — which after a restart is exactly what the start-up sweep
    // exists to prevent. Better to say so than to let the second one
    // quietly overwrite the first.
    const job = buildJob();
    job.succeed(REPORT);

    expect(() => job.fail('too late')).toThrow(ImportJobAlreadyFinishedError);
    expect(() => job.succeed(REPORT)).toThrow(ImportJobAlreadyFinishedError);
    expect(job.status).toBe('analyzed');
  });

  it('refuses to finish a job that already failed', () => {
    const job = buildJob();
    job.fail('the server restarted');

    expect(() => job.succeed(REPORT)).toThrow(ImportJobAlreadyFinishedError);
    expect(job.failureReason).toBe('the server restarted');
  });

  it('comes back from its own props unchanged', () => {
    const job = buildJob();
    job.succeed(REPORT);

    expect(ImportJob.fromProps(job.toProps()).toProps()).toEqual(job.toProps());
  });

  it('names the job it could not find', () => {
    const error = new ImportJobNotFoundError('job-9');

    expect(error.name).toBe('ImportJobNotFoundError');
    expect(error.message).toContain('job-9');
  });

  it('hands out a copy of its props, not the props themselves', () => {
    // A caller that edits what it was given must not be editing the job:
    // the repository writes these straight into a row.
    const job = buildJob();

    const props = job.toProps();
    props.status = 'failed';

    expect(job.status).toBe('analyzing');
  });
});
