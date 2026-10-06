import { queryOptions, useQuery } from '@tanstack/react-query';
import { getDeployment } from '../../lib/deployment-api-client';

/**
 * What the server can do (docs/adr/0103). It changes only when the server is
 * restarted with other settings, so a few minutes without asking again is
 * right: a dialog opened twice does not ask twice.
 */
export function deploymentQueryOptions() {
  return queryOptions({
    queryKey: ['deployment'] as const,
    queryFn: getDeployment,
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether an email the editor asks the server to send will be mailed. False
 * only when the server has said it cannot; while the answer is unknown, or
 * when the server could not be asked, it is true, so nothing is claimed that
 * was not told. One place for that rule: the notice and the words of the
 * confirmations that say "sent" both read it.
 */
export function useServerSendsEmail(): boolean {
  const { data } = useQuery(deploymentQueryOptions());
  return data?.emailConfigured !== false;
}

/** What the editor offers only where the server can do it (docs/adr/0105), by the name `GET /deployment` gives it. */
export type ServerFeature = 'siteArchive';

/**
 * What this server can do beyond what every server can. Each is false until the
 * server has said it can: a menu entry that might lead nowhere is worse than
 * one that is missing, so a server that has not answered yet, or could not be
 * asked, is read as unable. The opposite of `useServerSendsEmail`, for the
 * opposite reason: that one only warns, and this one offers.
 */
export function useServerFeatures(): Readonly<Record<ServerFeature, boolean>> {
  const { data } = useQuery(deploymentQueryOptions());
  return { siteArchive: data?.siteArchive === true };
}
