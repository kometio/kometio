import type { ImportJobStatus, WordPressAnalysis } from '@kometio/shared-types';

export type { ImportJobStatus };

export interface ImportJobProps {
  id: string;
  tenantId: string;
  siteId: string;
  /** `'wordpress'` today; a second source writes its own name. */
  source: string;
  fileName: string;
  fileBytes: number;
  status: ImportJobStatus;
  /** Present only once the analysis has finished. */
  report: WordPressAnalysis | null;
  /** Present only when it failed, and written for whoever uploaded the file to read. */
  failureReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface CreateImportJobProps {
  id: string;
  tenantId: string;
  siteId: string;
  source: string;
  fileName: string;
  fileBytes: number;
  createdBy: string | null;
  now?: Date;
}

/**
 * One attempt at bringing a site in from somewhere else (docs/adr/0082).
 *
 * It exists because reading an export is not something a request can wait
 * for — the first client site measured is 314 MB and takes four seconds —
 * and because the answer is meant to be read and thought about before
 * anything is imported. So the upload starts a job, and the job is the
 * thing the editor watches.
 *
 * It never goes back to `analyzing`: a job is one attempt at one file,
 * and a second attempt is a second job. That is what makes the list
 * below it a history rather than a mutable status.
 */
export class ImportJob {
  private constructor(private props: ImportJobProps) {}

  static create(input: CreateImportJobProps): ImportJob {
    return new ImportJob({
      ...input,
      status: 'analyzing',
      report: null,
      failureReason: null,
      createdAt: input.now ?? new Date(),
      finishedAt: null,
    });
  }

  static fromProps(props: ImportJobProps): ImportJob {
    return new ImportJob({ ...props });
  }

  toProps(): ImportJobProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get siteId(): string {
    return this.props.siteId;
  }

  get status(): ImportJobStatus {
    return this.props.status;
  }

  get report(): WordPressAnalysis | null {
    return this.props.report;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  /** True while the work may still be running — the one thing polling asks. */
  get isRunning(): boolean {
    return this.props.status === 'analyzing';
  }

  succeed(report: WordPressAnalysis, now: Date = new Date()): void {
    this.settle('analyzed', now);
    this.props.report = report;
  }

  /**
   * `reason` is shown to whoever uploaded the file, so it says what went
   * wrong with *their file* — never a stack trace, which tells them
   * nothing and tells everyone else too much.
   */
  fail(reason: string, now: Date = new Date()): void {
    this.settle('failed', now);
    this.props.failureReason = reason;
  }

  private settle(status: ImportJobStatus, now: Date): void {
    if (!this.isRunning) {
      throw new ImportJobAlreadyFinishedError(this.props.id);
    }
    this.props.status = status;
    this.props.finishedAt = now;
  }
}

/**
 * Finishing a job twice means two things are doing the same work, which
 * on a restart is exactly what the start-up sweep exists to prevent —
 * better to say so than to let the second one overwrite the first.
 */
export class ImportJobAlreadyFinishedError extends Error {
  constructor(id: string) {
    super(`Import job ${id} has already finished`);
    this.name = 'ImportJobAlreadyFinishedError';
  }
}

export class ImportJobNotFoundError extends Error {
  constructor(id: string) {
    super(`Import job ${id} not found`);
    this.name = 'ImportJobNotFoundError';
  }
}
