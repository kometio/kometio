import type { DeploymentRecord } from '@kometio/api-contracts';

/**
 * What `GET /deployment` answers, for a spec: a server that can send email and
 * cannot export its site, unless the spec says otherwise. One place for the
 * fields a spec does not care about, so a new one is added here and not to
 * every spec that mocks the answer.
 */
export function deploymentRecord(
  overrides: Partial<DeploymentRecord> = {},
): DeploymentRecord {
  return { emailConfigured: true, siteArchive: false, ...overrides };
}
