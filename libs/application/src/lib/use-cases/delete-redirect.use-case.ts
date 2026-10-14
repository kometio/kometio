import { RedirectNotFoundError } from '@kometio/domain-core';
import type { RedirectDeps } from '../redirects/redirect-deps';

export type DeleteRedirectDeps = Pick<
  RedirectDeps,
  'redirectRepository' | 'ruleSets'
>;

export interface DeleteRedirectInput {
  tenantId: string;
  redirectId: string;
}

export async function deleteRedirect(
  deps: DeleteRedirectDeps,
  input: DeleteRedirectInput,
): Promise<void> {
  const redirect = await deps.redirectRepository.findById(
    input.tenantId,
    input.redirectId,
  );
  if (!redirect) throw new RedirectNotFoundError(input.redirectId);

  await deps.redirectRepository.delete(input.tenantId, input.redirectId);
  deps.ruleSets.invalidate(redirect.siteId);
}
