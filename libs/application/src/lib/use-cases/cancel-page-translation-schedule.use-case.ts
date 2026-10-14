import {
  PageTranslationNotFoundError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface CancelPageTranslationScheduleDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface CancelPageTranslationScheduleInput {
  tenantId: string;
  pageTranslationId: string;
  actorUserId: string | null;
}

/** Takes a scheduled publication back (docs/adr/0135). What is online and the draft are as they were; nothing scheduled is not an error. */
export async function cancelPageTranslationSchedule(
  deps: CancelPageTranslationScheduleDeps,
  input: CancelPageTranslationScheduleInput,
): Promise<PageTranslation> {
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  translation.cancelSchedule({ by: input.actorUserId });
  await deps.pageTranslationRepository.saveSchedule(translation);
  return translation;
}
