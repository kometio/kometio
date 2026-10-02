import { queryOptions } from '@tanstack/react-query';
import { getImportJob, listImportJobs } from '../../lib/imports-api-client';

export function importJobsQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['imports', 'list', siteId] as const,
    queryFn: () => listImportJobs(siteId),
  });
}

export function importJobQueryOptions(jobId: string | null) {
  return queryOptions({
    queryKey: ['imports', 'detail', jobId] as const,
    queryFn: () => getImportJob(jobId ?? ''),
    enabled: jobId !== null,
    /**
     * The one polling query in this app.
     *
     * Reading an export happens in the API process with no queue behind
     * it (ADR-0082), so there is nothing to subscribe to — and it is
     * seconds, not minutes: four for the largest real export measured.
     * The interval stops the moment the job does.
     */
    refetchInterval: (query) =>
      query.state.data?.status === 'analyzing' ? 1000 : false,
  });
}
