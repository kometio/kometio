import {
  PageTranslationNotFoundError,
  PublishScheduleNotAheadError,
  type PageTranslation,
} from '@kometio/domain-core';
import type { PageTranslationRepositoryPort } from '@kometio/ports';

export interface SchedulePageTranslationPublishDeps {
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface SchedulePageTranslationPublishInput {
  tenantId: string;
  pageTranslationId: string;
  /** When to publish it. Must be ahead of `now`. */
  publishAt: Date;
  /** Recorded as the one whose work the publication is, since nobody is there at the time. */
  actorUserId: string | null;
  /** The clock, for the tests. */
  now?: Date;
}

/**
 * Asks for one language of a page to be published at a moment of its own
 * (docs/adr/0135). Nothing is published now, and nothing is frozen: what goes
 * online is the draft as it stands when the moment comes, as publishing by
 * hand freezes the draft as it stands when the button is pressed.
 *
 * A moment that is not ahead is refused rather than done: it would be a
 * publication at the next tick, and "publish" is a button of its own.
 */
export async function schedulePageTranslationPublish(
  deps: SchedulePageTranslationPublishDeps,
  input: SchedulePageTranslationPublishInput,
): Promise<PageTranslation> {
  const now = input.now ?? new Date();
  if (input.publishAt.getTime() <= now.getTime()) {
    throw new PublishScheduleNotAheadError();
  }
  const translation = await deps.pageTranslationRepository.findById(
    input.tenantId,
    input.pageTranslationId,
  );
  if (!translation) {
    throw new PageTranslationNotFoundError(input.pageTranslationId);
  }
  translation.schedulePublish(input.publishAt, {
    by: input.actorUserId,
    now,
  });
  await deps.pageTranslationRepository.saveSchedule(translation);
  return translation;
}
