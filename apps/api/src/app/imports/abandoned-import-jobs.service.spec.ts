import { randomUUID } from 'node:crypto';
import { ImportJob } from '@kometio/domain-core';
import { InMemoryImportJobRepository } from '@kometio/testing';
import { AbandonedImportJobsService } from './abandoned-import-jobs.service';

describe('AbandonedImportJobsService', () => {
  const TENANT = 'tenant-1';
  let jobs: InMemoryImportJobRepository;

  beforeEach(() => {
    jobs = new InMemoryImportJobRepository();
  });

  async function jobOf(tenantId: string): Promise<ImportJob> {
    const job = ImportJob.create({
      id: randomUUID(),
      tenantId,
      siteId: 'site-1',
      source: 'wordpress',
      fileName: 'export.xml',
      fileBytes: 10,
      createdBy: null,
    });
    await jobs.add(job);
    return job;
  }

  const startedFor = (tenantId: string | null) =>
    new AbandonedImportJobsService(
      jobs,
      async () => tenantId,
    ).onApplicationBootstrap();

  it('closes the jobs that were being read when the server stopped, and says why', async () => {
    const running = await jobOf(TENANT);

    await startedFor(TENANT);

    expect(running.status).toBe('failed');
    expect(running.failureReason).toBe(
      'The server restarted while this file was being read.',
    );
  });

  it('leaves a job that had already failed with the reason it has', async () => {
    const failed = await jobOf(TENANT);
    failed.fail('The file is not an export.');

    await startedFor(TENANT);

    expect(failed.failureReason).toBe('The file is not an export.');
  });

  it('leaves the jobs of another tenant alone', async () => {
    const other = await jobOf('tenant-2');

    await startedFor(TENANT);

    expect(other.status).toBe('analyzing');
  });

  it('does nothing before the first-run wizard has made a tenant', async () => {
    const running = await jobOf(TENANT);

    await startedFor(null);

    expect(running.status).toBe('analyzing');
  });
});
