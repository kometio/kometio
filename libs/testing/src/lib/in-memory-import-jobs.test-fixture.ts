import { ImportJob, ImportJobNotFoundError } from '@kometio/domain-core';
import type { ImportJobRepositoryPort } from '@kometio/ports';
import type { WordPressPermalink } from '@kometio/shared-types';

/** `ImportJobRepositoryPort` in memory, with the permalinks kept apart from the job as the database keeps them. */
export class InMemoryImportJobRepository implements ImportJobRepositoryPort {
  private readonly jobs = new Map<string, ImportJob>();
  private readonly permalinks = new Map<string, WordPressPermalink[]>();

  async add(job: ImportJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async save(job: ImportJob): Promise<void> {
    if (!this.jobs.has(job.id)) throw new ImportJobNotFoundError(job.id);
    this.jobs.set(job.id, job);
  }

  async findById(tenantId: string, id: string): Promise<ImportJob | null> {
    const job = this.jobs.get(id);
    return job && job.tenantId === tenantId ? job : null;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    if ((await this.findById(tenantId, id)) === null) {
      throw new ImportJobNotFoundError(id);
    }
    this.jobs.delete(id);
    this.permalinks.delete(id);
  }

  async listBySite(tenantId: string, siteId: string): Promise<ImportJob[]> {
    return [...this.jobs.values()].filter(
      (job) => job.tenantId === tenantId && job.siteId === siteId,
    );
  }

  async listRunning(tenantId: string): Promise<ImportJob[]> {
    return [...this.jobs.values()].filter(
      (job) => job.tenantId === tenantId && job.isRunning,
    );
  }

  async savePermalinks(
    tenantId: string,
    jobId: string,
    permalinks: readonly WordPressPermalink[],
  ): Promise<void> {
    if ((await this.findById(tenantId, jobId)) === null) {
      throw new ImportJobNotFoundError(jobId);
    }
    this.permalinks.set(jobId, [...permalinks]);
  }

  async permalinksOf(
    tenantId: string,
    jobId: string,
  ): Promise<WordPressPermalink[] | null> {
    if ((await this.findById(tenantId, jobId)) === null) return null;
    return this.permalinks.get(jobId) ?? null;
  }
}
