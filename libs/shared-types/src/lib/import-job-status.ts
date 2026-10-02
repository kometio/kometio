/** Where an import has got to (docs/adr/0082) — the one list the domain, the wire and the `import_job_status` enum read. */
export const IMPORT_JOB_STATUSES = ['analyzing', 'analyzed', 'failed'] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];
