import { randomUUID } from 'node:crypto';
import { ImportJob, ImportJobNotFoundError } from '@kometio/domain-core';
import type {
  ImportJobRepositoryPort,
  SiteRepositoryPort,
  WordPressExportReaderPort,
} from '@kometio/ports';
import { analyzeWordPressExport } from './analyze-wordpress-export.use-case';
import { requireSite } from './require-site';

export interface ImportJobDeps {
  importJobRepository: ImportJobRepositoryPort;
  siteRepository: SiteRepositoryPort;
  exportReader: WordPressExportReaderPort;
}

export interface StartWordPressAnalysisInput {
  tenantId: string;
  siteId: string;
  /** Where the upload landed. Read once, then the caller deletes it. */
  filePath: string;
  fileName: string;
  fileBytes: number;
  createdBy: string | null;
}

/**
 * Records the attempt and hands back the job straight away.
 *
 * The reading itself is `runWordPressAnalysis` below, which the caller
 * starts and does not wait for: a 314 MB export takes four seconds to
 * read, and the answer is meant to be looked at rather than returned.
 */
export async function startWordPressAnalysis(
  deps: ImportJobDeps,
  input: StartWordPressAnalysisInput,
): Promise<ImportJob> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);

  const job = ImportJob.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    source: 'wordpress',
    fileName: input.fileName,
    fileBytes: input.fileBytes,
    createdBy: input.createdBy,
  });
  await deps.importJobRepository.add(job);
  return job;
}

/**
 * Does the reading, and writes down how it went either way.
 *
 * Never throws: it runs detached from the request that started it, so a
 * rejection here has nowhere to go but an unhandled promise. The failure
 * belongs on the job, where the person who uploaded the file will look
 * for it.
 */
export async function runWordPressAnalysis(
  deps: ImportJobDeps,
  input: { tenantId: string; jobId: string; filePath: string },
): Promise<void> {
  const job = await deps.importJobRepository.findById(
    input.tenantId,
    input.jobId,
  );
  if (!job) return;

  try {
    const report = await analyzeWordPressExport(
      { exportReader: deps.exportReader },
      { filePath: input.filePath },
    );
    job.succeed(report);
  } catch (error) {
    // What went wrong with *this file*, in words its owner can act on.
    // The details go to the server's log, not to the screen.
    job.fail(
      error instanceof Error && error.message.includes('ENOENT')
        ? 'The uploaded file could not be read.'
        : 'This file could not be read as a WordPress export.',
    );
  }
  await deps.importJobRepository.save(job);
}

export async function getImportJob(
  deps: Pick<ImportJobDeps, 'importJobRepository'>,
  input: { tenantId: string; jobId: string },
): Promise<ImportJob> {
  const job = await deps.importJobRepository.findById(
    input.tenantId,
    input.jobId,
  );
  if (!job) {
    throw new ImportJobNotFoundError(input.jobId);
  }
  return job;
}

export function listImportJobs(
  deps: Pick<ImportJobDeps, 'importJobRepository'>,
  input: { tenantId: string; siteId: string },
): Promise<ImportJob[]> {
  return deps.importJobRepository.listBySite(input.tenantId, input.siteId);
}

/**
 * Marks as failed every job that was still running when the process
 * stopped.
 *
 * The work happens inside the API process (docs/adr/0082 — no queue, one
 * container per site), so a job left `analyzing` has nobody doing it and
 * would be watched forever by an editor that polls. Saying so is the
 * honest version of the same fact.
 */
export async function failAbandonedImportJobs(
  deps: Pick<ImportJobDeps, 'importJobRepository'>,
  input: { tenantId: string },
): Promise<number> {
  const running = await deps.importJobRepository.listRunning(input.tenantId);
  for (const job of running) {
    job.fail('The server restarted while this file was being read.');
    await deps.importJobRepository.save(job);
  }
  return running.length;
}
