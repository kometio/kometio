import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportJob } from '@kometio/domain-core';
import type { WordPressAnalysis } from '@kometio/shared-types';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleImportJobRepository } from './drizzle-import-job.repository';

const REPORT: WordPressAnalysis = {
  siteTitle: 'Il sito',
  sourceUrl: 'https://esempio.test',
  found: {
    pages: 2,
    posts: 0,
    attachments: 0,
    menuItems: 0,
    otherTypes: [{ type: 'product', count: 9685 }],
  },
  pages: { whole: 1, partial: 1, empty: 0 },
  blocks: {
    total: 3,
    native: 2,
    fromFields: 1,
    fromFieldsByBlock: [
      { name: 'acf/hero', count: 1, knownFrom: 'definitions' },
    ],
    dropped: 0,
    quarantined: [],
  },
  terms: [],
  warnings: [
    { kind: 'unsupported-post-types', count: 9685, detail: ['product (9685)'] },
  ],
};

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app` like production code, so this is also the row-level-security
 * regression test for `import_jobs`: a report names a site's pages and the
 * plugins it runs, and is exactly the kind of row whose leak nobody would
 * notice.
 */
describe('DrizzleImportJobRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleImportJobRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;
  let siteBId: string;

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleImportJobRepository(db);
    tenantAId = await createIntegrationTenant(db, 'Import Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Import Tenant B');
    siteAId = await createIntegrationSite(db, tenantAId);
    siteBId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function buildJob(
    overrides: Partial<Parameters<typeof ImportJob.create>[0]> = {},
  ): ImportJob {
    return ImportJob.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      source: 'wordpress',
      fileName: 'export.xml',
      fileBytes: 314_000_000,
      createdBy: null,
      ...overrides,
    });
  }

  it('saves a job and reads it back with its size intact', async () => {
    // 314 MB is a real client export and comfortably past a 32-bit int's
    // signed range once it is bytes — worth pinning down.
    const job = buildJob();
    await repository.add(job);

    const found = await repository.findById(tenantAId, job.id);

    expect(found?.toProps()).toMatchObject({
      fileName: 'export.xml',
      fileBytes: 314_000_000,
      status: 'analyzing',
      report: null,
    });
  });

  it('keeps the whole report through the round trip', async () => {
    const job = buildJob();
    await repository.add(job);
    job.succeed(REPORT);
    await repository.save(job);

    const found = await repository.findById(tenantAId, job.id);

    expect(found?.status).toBe('analyzed');
    expect(found?.report).toEqual(REPORT);
    expect(found?.toProps().finishedAt).toBeInstanceOf(Date);
  });

  it('saves a failure as something the person can read', async () => {
    const job = buildJob();
    await repository.add(job);
    job.fail('This file could not be read as a WordPress export.');
    await repository.save(job);

    const found = await repository.findById(tenantAId, job.id);

    expect(found?.status).toBe('failed');
    expect(found?.failureReason).toBe(
      'This file could not be read as a WordPress export.',
    );
  });

  it('a second save updates the row instead of inserting another', async () => {
    const job = buildJob();
    await repository.add(job);
    job.succeed(REPORT);
    await repository.save(job);

    const all = await repository.listBySite(tenantAId, siteAId);

    expect(all.filter((one) => one.id === job.id)).toHaveLength(1);
  });

  it('lists one site attempts, newest first, without the other site', async () => {
    const older = buildJob();
    await repository.add(older);
    const newer = buildJob();
    await repository.add(newer);
    const elsewhere = buildJob({ siteId: siteBId });
    await repository.add(elsewhere);

    const listed = await repository.listBySite(tenantAId, siteAId);
    const ids = listed.map((one) => one.id);

    expect(ids).not.toContain(elsewhere.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it('lists what was still running, across every site of the tenant', async () => {
    // What the start-up sweep asks: the process that was reading these is
    // gone, whichever site they belonged to.
    const running = buildJob();
    await repository.add(running);
    const runningElsewhere = buildJob({ siteId: siteBId });
    await repository.add(runningElsewhere);
    const finished = buildJob();
    await repository.add(finished);
    finished.succeed(REPORT);
    await repository.save(finished);

    const ids = (await repository.listRunning(tenantAId)).map((one) => one.id);

    expect(ids).toContain(running.id);
    expect(ids).toContain(runningElsewhere.id);
    expect(ids).not.toContain(finished.id);
  });

  it('never hands one tenant another tenant report', async () => {
    const job = buildJob();
    await repository.add(job);
    job.succeed(REPORT);
    await repository.save(job);

    expect(await repository.findById(tenantBId, job.id)).toBeNull();
    expect(await repository.listRunning(tenantBId)).toEqual([]);
  });
});
