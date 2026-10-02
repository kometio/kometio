import { queryOptions } from '@tanstack/react-query';
import {
  getAiSettings,
  getPageGenerationStatus,
} from '../../lib/page-generation-api-client';

/** How the site generates pages — admins only, for the settings screen. */
export function aiSettingsQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['sites', siteId, 'ai-settings'] as const,
    queryFn: () => getAiSettings(siteId),
  });
}

/**
 * Whether generating works here, for every "Generate with AI" entry point:
 * each says what is missing instead of offering a button that cannot work.
 */
export function pageGenerationStatusQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['sites', siteId, 'ai-settings', 'status'] as const,
    queryFn: () => getPageGenerationStatus(siteId),
  });
}
