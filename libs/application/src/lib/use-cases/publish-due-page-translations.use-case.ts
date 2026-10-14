import {
  hasPermission,
  type ScheduleBlockedReason,
} from '@kometio/shared-types';
import type { UserRepositoryPort } from '@kometio/ports';
import {
  publishPageTranslation,
  type PublishPageTranslationDeps,
} from './publish-page-translation.use-case';

export interface PublishDuePageTranslationsDeps extends PublishPageTranslationDeps {
  /** Who set a moment is asked about again when it comes (docs/adr/0135). */
  userRepository: UserRepositoryPort;
}

export interface PublishDuePageTranslationsInput {
  tenantId: string;
  /** The clock, for the tests. */
  now?: Date;
  /** How many one tick takes; the next takes the rest. */
  batchSize?: number;
}

export interface PublishDuePageTranslationsResult {
  /** Online now, whatever happened after. */
  published: number;
  /** Newly not published: still scheduled, with the reason on the page. What failed is tried again at the next tick; what was not allowed waits for somebody to schedule it again. A reason already written is not counted again. */
  failed: number;
  /** Published, but the search index did not take it: the page is live and its words are not searchable until it is published again. A subset of `published`. */
  notIndexed: number;
}

const DEFAULT_BATCH = 50;
const REASON_LIMIT = 500;

/**
 * Whether the person who set the moment may still publish, asked at the
 * moment itself. A schedule is a publication made under their name when
 * nobody is looking, so it is their permission of that minute that counts,
 * not the one they had when they set it: somebody demoted, deactivated or
 * removed in between must not be able to put a page online by having asked
 * for it earlier.
 */
async function whyNotAllowed(
  deps: PublishDuePageTranslationsDeps,
  tenantId: string,
  scheduledBy: string | null,
): Promise<ScheduleBlockedReason | null> {
  if (scheduledBy === null) return 'scheduler-gone';
  const user = await deps.userRepository.findById(tenantId, scheduledBy);
  if (user === null) return 'scheduler-gone';
  if (!user.isActive) return 'scheduler-inactive';
  if (!hasPermission(user.role, 'changeLiveSite')) {
    return 'scheduler-cannot-publish';
  }
  return null;
}

/**
 * What a tick of the API does (docs/adr/0135): publishes every language
 * whose moment has come, each as the person who scheduled it.
 *
 * One at a time and each on its own: a page that cannot be published is
 * written down as such — on the page, where somebody will look — and does
 * not hold up the ones behind it. It stays scheduled, because what fails here
 * is nearly always something that passes a minute later; a person who would
 * rather not have it tried again cancels it.
 */
export async function publishDuePageTranslations(
  deps: PublishDuePageTranslationsDeps,
  input: PublishDuePageTranslationsInput,
): Promise<PublishDuePageTranslationsResult> {
  const now = input.now ?? new Date();
  const due = await deps.pageTranslationRepository.listDueForPublish(
    input.tenantId,
    now,
    input.batchSize ?? DEFAULT_BATCH,
  );
  const result: PublishDuePageTranslationsResult = {
    published: 0,
    failed: 0,
    notIndexed: 0,
  };

  for (const translation of due) {
    const notAllowed = await whyNotAllowed(
      deps,
      input.tenantId,
      translation.scheduledBy,
    );
    if (notAllowed !== null) {
      // Written, and counted, once: nothing here changes by waiting, and a
      // line in the log every minute for a page somebody has to look at is
      // not news after the first.
      if (translation.scheduleFailure !== notAllowed) {
        translation.recordScheduleFailure(notAllowed);
        await deps.pageTranslationRepository.saveSchedule(translation);
        result.failed += 1;
      }
      continue;
    }
    try {
      await publishPageTranslation(deps, {
        tenantId: input.tenantId,
        pageTranslationId: translation.id,
        actorUserId: translation.scheduledBy,
      });
      result.published += 1;
    } catch (error) {
      // Read again rather than trusted: publishing writes the page and then
      // indexes it, and a failure of the second is a page that is online.
      const current = await deps.pageTranslationRepository.findById(
        input.tenantId,
        translation.id,
      );
      if (current === null) continue;
      if (current.scheduledPublishAt === null) {
        result.published += 1;
        result.notIndexed += 1;
        continue;
      }
      const reason = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, REASON_LIMIT);
      // The same reason as the last attempt's is not news either.
      if (current.scheduleFailure !== reason) {
        current.recordScheduleFailure(reason);
        await deps.pageTranslationRepository.saveSchedule(current);
        result.failed += 1;
      }
    }
  }
  return result;
}
