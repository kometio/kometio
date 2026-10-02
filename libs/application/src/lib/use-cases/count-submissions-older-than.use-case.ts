import type {
  FormSubmissionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface CountSubmissionsOlderThanDeps {
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
  formSubmissionRepository: FormSubmissionRepositoryPort;
}

export interface CountSubmissionsOlderThanInput {
  tenantId: string;
  siteId: string;
  olderThanDays: number;
}

/**
 * How many answers a retention of this many days would delete at the next
 * clean-up: the number the question before saving a shorter retention
 * says, instead of "some". Answers for the site as a whole, as the
 * clean-up does — retention is a setting of the site, not of a form.
 */
export async function countSubmissionsOlderThan(
  deps: CountSubmissionsOlderThanDeps,
  input: CountSubmissionsOlderThanInput,
): Promise<number> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  return deps.formSubmissionRepository.countOlderThan(
    input.tenantId,
    input.siteId,
    input.olderThanDays,
  );
}
