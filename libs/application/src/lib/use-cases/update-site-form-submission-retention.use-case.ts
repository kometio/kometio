import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteFormSubmissionRetentionDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteFormSubmissionRetentionInput {
  tenantId: string;
  siteId: string;
  formSubmissionRetentionDays: number | null;
}

export async function updateSiteFormSubmissionRetention(
  deps: UpdateSiteFormSubmissionRetentionDeps,
  input: UpdateSiteFormSubmissionRetentionInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateFormSubmissionRetention({
    formSubmissionRetentionDays: input.formSubmissionRetentionDays,
  });
  await deps.siteRepository.save(site);

  return site;
}
